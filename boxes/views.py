from django.db.models import Count, Exists, OuterRef, ProtectedError, Q, Subquery
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from . import cobranca, espera
from .contrato_pdf import gerar_pdf_contrato
from .models import Box, Cliente, Contrato, Funcionario, Interessado, Mensalidade, Sede, TipoBox
from .permissions import EhAdminOuFuncionario, SomenteAdminAltera, sede_do_usuario
from .serializers import (
    BoxSerializer,
    ClienteSerializer,
    ContratoSerializer,
    FuncionarioSerializer,
    InteressadoSerializer,
    MensalidadeSerializer,
    PagamentoSerializer,
    SedeOpcaoSerializer,
    SedeSerializer,
    TipoBoxSerializer,
)


class FiltraPorSedeMixin:
    """Funcionário só enxerga registros da própria sede (admin vê todos)."""

    campo_sede = "sede_id"

    def filtrar_por_sede(self, qs, campo=None):
        sede = sede_do_usuario(self.request.user)
        return qs if sede is None else qs.filter(**{campo or self.campo_sede: sede})


class ProtegidoContraExclusaoMixin:
    """Responde 409 em vez de erro 500 ao apagar registro que tem vínculos."""

    mensagem_protegido = "Não é possível excluir: existem boxes ou contratos vinculados."

    def destroy(self, request, *args, **kwargs):
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            return Response({"detail": self.mensagem_protegido}, status=status.HTTP_409_CONFLICT)


class SedeViewSet(FiltraPorSedeMixin, ProtegidoContraExclusaoMixin, viewsets.ModelViewSet):
    """Funcionário vê só a própria sede; só administrador cria/edita/exclui."""

    serializer_class = SedeSerializer
    permission_classes = [EhAdminOuFuncionario, SomenteAdminAltera]
    campo_sede = "id"

    def get_queryset(self):
        return self.filtrar_por_sede(Sede.objects.all()).annotate(
            numero_de_box=Count("boxes"),
            alugados=Count("boxes", filter=Q(boxes__cliente__isnull=False)),
            nao_alugados=Count("boxes", filter=Q(boxes__cliente__isnull=True)),
        ).order_by("nome")


class ClienteViewSet(ProtegidoContraExclusaoMixin, viewsets.ModelViewSet):
    """Clientes são compartilhados entre as sedes (um cliente pode alugar nas duas)."""

    serializer_class = ClienteSerializer

    def get_queryset(self):
        sede = sede_do_usuario(self.request.user)
        filtro_sede = Q() if sede is None else Q(mensalidades__box__sede_id=sede)
        qs = Cliente.objects.annotate(
            total_boxes=Count("boxes", distinct=True),
            atrasadas=Count(
                "mensalidades",
                filter=filtro_sede & Q(mensalidades__pago_em__isnull=True, mensalidades__vencimento__lt=cobranca.hoje()),
                distinct=True,
            ),
        )
        if busca := self.request.query_params.get("busca", "").strip():
            digitos = "".join(c for c in busca if c.isdigit())
            cond = Q(nome__icontains=busca)
            if len(digitos) >= 3:
                cond |= Q(telefone__contains=digitos) | Q(cpf__contains=digitos)
            qs = qs.filter(cond)
        return qs.order_by("nome")

    @action(detail=True, methods=["get"])
    def ficha(self, request, pk=None):
        """Boxes e mensalidades do cliente (funcionário: só os da própria sede)."""
        cliente = self.get_object()
        sede = sede_do_usuario(request.user)
        boxes = cliente.boxes.select_related("sede")
        mensalidades = cliente.mensalidades.select_related("box__sede", "cliente", "registrado_por__funcionario")
        if sede is not None:
            boxes = boxes.filter(sede_id=sede)
            mensalidades = mensalidades.filter(box__sede_id=sede)
        cobranca.garantir_mensalidades(boxes=Box.objects.filter(cliente=cliente))
        ctx = {"request": request}
        return Response({
            "cliente": ClienteSerializer(self.get_queryset().get(pk=cliente.pk), context=ctx).data,
            "boxes": BoxSerializer(boxes, many=True, context=ctx).data,
            "mensalidades": MensalidadeSerializer(
                mensalidades.order_by("-vencimento", "box_id"), many=True, context=ctx
            ).data,
            "contratos": ContratoSerializer(
                Contrato.objects.filter(cliente=cliente, **({} if sede is None else {"box__sede_id": sede}))
                .select_related("box__sede", "cliente"),
                many=True,
            ).data,
            "outras_sedes": sede is not None and cliente.boxes.exclude(sede_id=sede).exists(),
        })


class BoxViewSet(FiltraPorSedeMixin, ProtegidoContraExclusaoMixin, viewsets.ModelViewSet):
    """
    Funcionário só vê e altera boxes da própria sede.
    Filtros opcionais: ?sede=<id>, ?cliente=<id>, ?alugado=true|false

    POST /api/boxes/<id>/liberar/ -> encerra o aluguel (remove cliente e comprovante)
    """

    serializer_class = BoxSerializer
    mensagem_protegido = "Este box tem histórico de contratos e não pode ser excluído."

    def create(self, request, *args, **kwargs):
        # Os boxes já existem fisicamente: são cadastrados de uma vez direto no
        # banco (ou pelo /admin/), nunca pelo site.
        return Response(
            {"detail": "Não é possível criar boxes pelo sistema."},
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    def get_queryset(self):
        atrasada = Mensalidade.objects.filter(
            box=OuterRef("pk"), pago_em__isnull=True, vencimento__lt=cobranca.hoje()
        )
        contrato = Contrato.objects.filter(box=OuterRef("pk"), fim__isnull=True).values("id")[:1]
        qs = self.filtrar_por_sede(Box.objects.select_related("sede", "cliente", "tipo")).annotate(
            em_atraso=Exists(atrasada), contrato_ativo=Subquery(contrato)
        )
        params = self.request.query_params
        if sede := params.get("sede"):
            qs = qs.filter(sede_id=sede)
        if cliente := params.get("cliente"):
            qs = qs.filter(cliente_id=cliente)
        if (alugado := params.get("alugado")) in ("true", "false"):
            qs = qs.filter(cliente__isnull=(alugado == "false"))
        return qs

    def list(self, request, *args, **kwargs):
        cobranca.garantir_mensalidades(boxes=self.filtrar_por_sede(Box.objects.all()))
        return super().list(request, *args, **kwargs)

    @action(detail=True, methods=["post"])
    def liberar(self, request, pk=None):
        box = self.get_object()
        cobranca.encerrar_aluguel(box, request.user)
        return Response(self.get_serializer(self.get_queryset().get(pk=box.pk)).data)


class FuncionarioViewSet(FiltraPorSedeMixin, viewsets.ReadOnlyModelViewSet):
    """
    Consulta de funcionários (funcionário vê só os colegas da própria sede).
    Filtros opcionais: ?sede=<id>, ?aprovado=true|false
    O cadastro é feito em /api/auth/registro/.

    GET  /api/funcionarios/sedes/          -> aberto: sedes para o formulário de cadastro
    POST /api/funcionarios/<id>/aprovar/   -> só admin: libera o acesso
    POST /api/funcionarios/<id>/bloquear/  -> só admin: bloqueia o acesso
    """

    serializer_class = FuncionarioSerializer

    def get_permissions(self):
        if self.action == "sedes":
            return [permissions.AllowAny()]
        return super().get_permissions()

    def get_queryset(self):
        qs = self.filtrar_por_sede(Funcionario.objects.select_related("sede", "usuario"))
        if sede := self.request.query_params.get("sede"):
            qs = qs.filter(sede_id=sede)
        if (aprovado := self.request.query_params.get("aprovado")) in ("true", "false"):
            qs = qs.filter(usuario__is_active=(aprovado == "true"))
        return qs

    @action(detail=False, methods=["get"])
    def sedes(self, request):
        return Response(SedeOpcaoSerializer(Sede.objects.all(), many=True).data)

    def _definir_acesso(self, ativo):
        funcionario = self.get_object()
        funcionario.usuario.is_active = ativo
        funcionario.usuario.save(update_fields=["is_active"])
        return Response(self.get_serializer(funcionario).data)

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAdminUser])
    def aprovar(self, request, pk=None):
        return self._definir_acesso(True)

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAdminUser])
    def bloquear(self, request, pk=None):
        if self.get_object().usuario_id == request.user.id:
            return Response({"detail": "Você não pode bloquear a si mesmo."}, status=400)
        return self._definir_acesso(False)


SITUACOES = {
    "paga": lambda h: Q(pago_em__isnull=False),
    "pendente": lambda h: Q(pago_em__isnull=True),
    "atrasada": lambda h: Q(pago_em__isnull=True, vencimento__lt=h),
    "vence_hoje": lambda h: Q(pago_em__isnull=True, vencimento=h),
    "a_vencer": lambda h: Q(pago_em__isnull=True, vencimento__gt=h),
}


class MensalidadeViewSet(FiltraPorSedeMixin, viewsets.ReadOnlyModelViewSet):
    """
    Mensalidades dos boxes (funcionário vê só as da própria sede).

    Filtros: ?competencia=AAAA-MM, ?situacao=paga|pendente|atrasada|vence_hoje|a_vencer,
             ?box=<id>, ?sede=<id>, ?vencimento=AAAA-MM-DD
    GET  /api/mensalidades/avisos/          -> vencimentos de hoje e atrasadas
    POST /api/mensalidades/<id>/pagar/      -> comprovante (+ pago_em opcional)
    POST /api/mensalidades/<id>/desfazer/   -> desfaz um pagamento registrado por engano
    """

    serializer_class = MensalidadeSerializer
    campo_sede = "box__sede_id"

    def get_queryset(self):
        qs = self.filtrar_por_sede(
            Mensalidade.objects.select_related("box__sede", "cliente", "registrado_por__funcionario")
        )
        p = self.request.query_params
        if competencia := p.get("competencia"):
            try:
                ano, mes = (int(x) for x in competencia.split("-")[:2])
                qs = qs.filter(competencia__year=ano, competencia__month=mes)
            except ValueError:
                qs = qs.none()
        if (situacao := p.get("situacao")) in SITUACOES:
            qs = qs.filter(SITUACOES[situacao](cobranca.hoje()))
        if box := p.get("box"):
            qs = qs.filter(box_id=box)
        if sede := p.get("sede"):
            qs = qs.filter(box__sede_id=sede)
        if vencimento := p.get("vencimento"):
            qs = qs.filter(vencimento=vencimento)
        return qs

    def _gerar(self):
        cobranca.garantir_mensalidades(boxes=self.filtrar_por_sede(Box.objects.all(), "sede_id"))

    def list(self, request, *args, **kwargs):
        self._gerar()
        return super().list(request, *args, **kwargs)

    @action(detail=False, methods=["get"])
    def avisos(self, request):
        self._gerar()
        hoje = cobranca.hoje()
        qs = self.get_queryset()
        vencem_hoje = qs.filter(vencimento=hoje)
        atrasadas = qs.filter(SITUACOES["atrasada"](hoje))
        ser = lambda q: MensalidadeSerializer(q, many=True, context={"request": request}).data  # noqa: E731
        return Response({
            "hoje": hoje,
            "dia_de_vencimento": bool(cobranca.dias_de_vencimento_hoje(hoje)),
            "vencem_hoje": ser(vencem_hoje),
            "atrasadas": ser(atrasadas),
            "pendencias": vencem_hoje.filter(pago_em__isnull=True).count() + atrasadas.count(),
        })

    @action(detail=True, methods=["post"])
    def pagar(self, request, pk=None):
        mensalidade = self.get_object()
        if mensalidade.pago:
            return Response({"detail": "Esta mensalidade já está paga."}, status=400)
        dados = PagamentoSerializer(data=request.data)
        dados.is_valid(raise_exception=True)
        mensalidade.comprovante = dados.validated_data["comprovante"]
        mensalidade.pago_em = dados.validated_data.get("pago_em") or cobranca.hoje()
        mensalidade.registrado_por = request.user
        mensalidade.save(update_fields=["comprovante", "pago_em", "registrado_por"])
        return Response(self.get_serializer(mensalidade).data)

    @action(detail=True, methods=["post"])
    def desfazer(self, request, pk=None):
        mensalidade = self.get_object()
        mensalidade.pago_em = None
        mensalidade.comprovante = None
        mensalidade.registrado_por = None
        mensalidade.save(update_fields=["comprovante", "pago_em", "registrado_por"])
        return Response(self.get_serializer(mensalidade).data)


class InteressadoViewSet(viewsets.ModelViewSet):
    """
    Lista de espera (compartilhada entre as sedes).

    Filtro: ?situacao=aguardando|contatado|alugou|desistiu
    GET /api/interessados/oportunidades/  -> quem está aguardando e já tem box
        livre (na sede do funcionário; admin: todas). Usado no sininho.
    GET /api/interessados/tamanhos/       -> tamanhos que existem nas sedes
    """

    serializer_class = InteressadoSerializer

    def get_queryset(self):
        qs = Interessado.objects.select_related("sede", "criado_por__funcionario")
        if situacao := self.request.query_params.get("situacao"):
            qs = qs.filter(situacao=situacao)
        return qs

    def get_serializer_context(self):
        return {**super().get_serializer_context(), "livres": espera.boxes_livres()}

    def perform_create(self, serializer):
        serializer.save(criado_por=self.request.user)

    def perform_update(self, serializer):
        antes = serializer.instance.situacao
        depois = serializer.validated_data.get("situacao", antes)
        extra = {}
        if depois != antes and depois != Interessado.AGUARDANDO and not serializer.instance.contatado_em:
            extra["contatado_em"] = timezone.now()
        if depois == Interessado.AGUARDANDO:
            extra["contatado_em"] = None
        serializer.save(**extra)

    @action(detail=False, methods=["get"])
    def oportunidades(self, request):
        sede = sede_do_usuario(request.user)
        itens = espera.oportunidades(sede)
        dados = []
        for interessado, vagas in itens:
            item = InteressadoSerializer(interessado, context={"livres": vagas}).data
            dados.append(item)
        return Response(dados)

    @action(detail=False, methods=["get"])
    def tamanhos(self, request):
        return Response(espera.tamanhos_cadastrados())


class DisponibilidadeView(APIView):
    """Boxes livres por sede e tamanho, para o funcionário consultar a outra sede."""

    def get(self, request):
        return Response(espera.disponibilidade())


class ContratoViewSet(FiltraPorSedeMixin, viewsets.ReadOnlyModelViewSet):
    """
    Contratos (aluguéis) atuais e encerrados. Funcionário: só os da própria sede.

    Filtros: ?cliente=<id>, ?box=<id>, ?ativo=true|false
    GET /api/contratos/<id>/pdf/ -> contrato em PDF
    """

    serializer_class = ContratoSerializer
    campo_sede = "box__sede_id"

    def get_queryset(self):
        qs = self.filtrar_por_sede(Contrato.objects.select_related("box__sede", "cliente"))
        p = self.request.query_params
        if cliente := p.get("cliente"):
            qs = qs.filter(cliente_id=cliente)
        if box := p.get("box"):
            qs = qs.filter(box_id=box)
        if (ativo := p.get("ativo")) in ("true", "false"):
            qs = qs.filter(fim__isnull=(ativo == "true"))
        return qs

    @action(detail=True, methods=["get"])
    def pdf(self, request, pk=None):
        contrato = self.get_object()
        resposta = HttpResponse(gerar_pdf_contrato(contrato), content_type="application/pdf")
        resposta["Content-Disposition"] = f'inline; filename="contrato-newbox-{contrato.numero}.pdf"'
        return resposta


class TipoBoxViewSet(ProtegidoContraExclusaoMixin, viewsets.ModelViewSet):
    """
    Catálogo de tamanhos por unidade. Todos os funcionários consultam (das duas
    sedes, para orientar o cliente); só o administrador altera.
    Filtro: ?sede=<id>
    """

    serializer_class = TipoBoxSerializer
    permission_classes = [EhAdminOuFuncionario, SomenteAdminAltera]
    pagination_class = None
    mensagem_protegido = "Há boxes cadastrados com este tamanho. Troque o tamanho deles antes de excluir."

    def get_queryset(self):
        qs = TipoBox.objects.select_related("sede").annotate(total_boxes=Count("boxes"))
        if sede := self.request.query_params.get("sede"):
            qs = qs.filter(sede_id=sede)
        return qs
