from django.db.models import Count, Exists, OuterRef, ProtectedError, Q
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from . import cobranca
from .models import Box, Cliente, Funcionario, Mensalidade, Sede
from .permissions import EhAdminOuFuncionario, SomenteAdminAltera, sede_do_usuario
from .serializers import (
    BoxSerializer,
    ClienteSerializer,
    FuncionarioSerializer,
    MensalidadeSerializer,
    PagamentoSerializer,
    SedeOpcaoSerializer,
    SedeSerializer,
)


class FiltraPorSedeMixin:
    """Funcionário só enxerga registros da própria sede (admin vê todos)."""

    campo_sede = "sede_id"

    def filtrar_por_sede(self, qs, campo=None):
        sede = sede_do_usuario(self.request.user)
        return qs if sede is None else qs.filter(**{campo or self.campo_sede: sede})


class ProtegidoContraExclusaoMixin:
    """Responde 409 em vez de erro 500 ao apagar registro que ainda tem boxes."""

    def destroy(self, request, *args, **kwargs):
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            return Response(
                {"detail": "Não é possível excluir: existem boxes vinculados."},
                status=status.HTTP_409_CONFLICT,
            )


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
        qs = Cliente.objects.annotate(total_boxes=Count("boxes"))
        if busca := self.request.query_params.get("busca", "").strip():
            qs = qs.filter(nome__icontains=busca)
        return qs.order_by("nome")


class BoxViewSet(FiltraPorSedeMixin, viewsets.ModelViewSet):
    """
    Funcionário só vê e altera boxes da própria sede.
    Filtros opcionais: ?sede=<id>, ?cliente=<id>, ?alugado=true|false

    POST /api/boxes/<id>/liberar/ -> encerra o aluguel (remove cliente e comprovante)
    """

    serializer_class = BoxSerializer

    def get_queryset(self):
        atrasada = Mensalidade.objects.filter(
            box=OuterRef("pk"), pago_em__isnull=True, vencimento__lt=cobranca.hoje()
        )
        qs = self.filtrar_por_sede(Box.objects.select_related("sede", "cliente")).annotate(
            em_atraso=Exists(atrasada)
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
        cobranca.encerrar_aluguel(box)
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
