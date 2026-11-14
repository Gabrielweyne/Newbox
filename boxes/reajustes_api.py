"""
API de reajustes (só administrador).

GET  /api/reajustes/                   histórico (?box=, ?cliente=, ?situacao=agendado|aplicado|cancelado)
POST /api/reajustes/previa/            {boxes, modo, valor|percentual, vigencia: "AAAA-MM"} -> como fica
POST /api/reajustes/                   mesmo corpo + mensagem, enviar_email -> cria, avisa e (se já vale) aplica
POST /api/reajustes/<id>/cancelar/     cancela um reajuste que ainda não começou a valer
POST /api/reajustes/<id>/reenviar-email/
POST /api/reajustes/<id>/whatsapp/     marca o aviso por WhatsApp como enviado
"""

from datetime import datetime

from django.utils import timezone
from rest_framework import mixins, permissions, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from . import cobranca, reajustes
from .models import Box, Reajuste


class ReajusteSerializer(serializers.ModelSerializer):
    box_numero = serializers.CharField(source="box.numero", read_only=True)
    box_tamanho = serializers.CharField(source="box.tamanho", read_only=True)
    sede_nome = serializers.CharField(source="box.sede.nome", read_only=True)
    cliente_nome = serializers.CharField(source="cliente.nome", read_only=True)
    cliente_telefone = serializers.CharField(source="cliente.telefone", read_only=True)
    cliente_email = serializers.CharField(source="cliente.email", read_only=True)
    situacao = serializers.CharField(read_only=True)
    percentual = serializers.FloatField(read_only=True)
    whatsapp_texto = serializers.SerializerMethodField()

    class Meta:
        model = Reajuste
        fields = [
            "id", "box", "box_numero", "box_tamanho", "sede_nome", "cliente", "cliente_nome", "cliente_telefone",
            "cliente_email", "valor_anterior", "valor_novo", "percentual", "vigencia", "mensagem", "situacao",
            "criado_em", "aplicado_em", "cancelado_em", "email_enviado_em", "email_erro", "whatsapp_enviado_em",
            "whatsapp_texto",
        ]
        read_only_fields = fields

    def get_whatsapp_texto(self, obj):
        return reajustes.texto_whatsapp(obj)


class PedidoReajusteSerializer(serializers.Serializer):
    boxes = serializers.PrimaryKeyRelatedField(queryset=Box.objects.select_related("cliente", "sede"), many=True)
    modo = serializers.ChoiceField(choices=["valor", "percentual"])
    valor = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, min_value=0)
    percentual = serializers.DecimalField(max_digits=5, decimal_places=2, required=False,
                                          min_value=-50, max_value=200)
    vigencia = serializers.CharField()
    mensagem = serializers.CharField(required=False, allow_blank=True, max_length=1000)
    enviar_email = serializers.BooleanField(required=False, default=True)

    def validate_vigencia(self, valor):
        try:
            mes = datetime.strptime(valor[:7], "%Y-%m").date()
        except ValueError:
            raise serializers.ValidationError("Use o formato AAAA-MM.")
        if mes < cobranca.inicio_do_mes(cobranca.hoje()):
            raise serializers.ValidationError("O reajuste não pode começar num mês que já passou.")
        return mes

    def validate(self, dados):
        if not dados["boxes"]:
            raise serializers.ValidationError({"boxes": "Escolha pelo menos um box."})
        if dados["modo"] == "valor" and dados.get("valor") is None:
            raise serializers.ValidationError({"valor": "Informe o novo valor."})
        if dados["modo"] == "percentual" and not dados.get("percentual"):
            raise serializers.ValidationError({"percentual": "Informe a porcentagem do reajuste."})
        pendentes = set(Reajuste.objects.filter(
            box__in=dados["boxes"], aplicado_em__isnull=True, cancelado_em__isnull=True
        ).values_list("box_id", flat=True))
        problemas = []
        for b in dados["boxes"]:
            if not b.alugado:
                problemas.append(f"{b.rotulo} ({b.sede.nome}) está livre: mude o valor em Boxes > Editar.")
            elif b.pk in pendentes:
                problemas.append(f"{b.rotulo} ({b.sede.nome}) já tem um reajuste agendado. Cancele-o antes.")
            elif dados["modo"] == "percentual" and not b.valor:
                problemas.append(f"{b.rotulo} ({b.sede.nome}) está com valor R$ 0,00: use o modo valor.")
        if problemas:
            raise serializers.ValidationError({"boxes": problemas})
        return dados


class ReajusteViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    serializer_class = ReajusteSerializer
    permission_classes = [permissions.IsAdminUser]

    def get_queryset(self):
        qs = Reajuste.objects.select_related("box__sede", "cliente")
        p = self.request.query_params
        if v := p.get("box"):
            qs = qs.filter(box_id=v)
        if v := p.get("cliente"):
            qs = qs.filter(cliente_id=v)
        situacao = p.get("situacao")
        if situacao == "agendado":
            qs = qs.filter(aplicado_em__isnull=True, cancelado_em__isnull=True)
        elif situacao == "aplicado":
            qs = qs.filter(aplicado_em__isnull=False)
        elif situacao == "cancelado":
            qs = qs.filter(cancelado_em__isnull=False)
        return qs

    def _pedido(self, request):
        pedido = PedidoReajusteSerializer(data=request.data)
        pedido.is_valid(raise_exception=True)
        return pedido.validated_data

    @action(detail=False, methods=["post"])
    def previa(self, request):
        d = self._pedido(request)
        linhas = []
        for b in d["boxes"]:
            novo = reajustes.novo_valor(b.valor, d["modo"], d.get("valor"), d.get("percentual"))
            linhas.append({
                "box": b.pk, "box_numero": b.numero, "sede_nome": b.sede.nome, "cliente_nome": b.cliente.nome,
                "valor_anterior": b.valor, "valor_novo": novo,
            })
        return Response({"vigencia": f"{d['vigencia']:%Y-%m}", "boxes": linhas,
                         "total_anterior": sum(x["valor_anterior"] for x in linhas),
                         "total_novo": sum(x["valor_novo"] for x in linhas)})

    def create(self, request):
        d = self._pedido(request)
        criados = reajustes.criar(
            d["boxes"], d["modo"], d["vigencia"], request.user, valor=d.get("valor"),
            percentual=d.get("percentual"), mensagem=d.get("mensagem", ""), enviar=d["enviar_email"],
        )
        for r in criados:
            r.refresh_from_db()
        return Response(ReajusteSerializer(criados, many=True).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def cancelar(self, request, pk=None):
        r = self.get_object()
        if r.situacao != "agendado":
            return Response({"detail": "Só dá para cancelar um reajuste que ainda não começou a valer."},
                            status=status.HTTP_409_CONFLICT)
        r.cancelado_em = timezone.now()
        r.save(update_fields=["cancelado_em"])
        return Response(ReajusteSerializer(r).data)

    @action(detail=True, methods=["post"], url_path="reenviar-email")
    def reenviar_email(self, request, pk=None):
        r = self.get_object()
        reajustes.enviar_email(r)
        return Response(ReajusteSerializer(r).data)

    @action(detail=True, methods=["post"])
    def whatsapp(self, request, pk=None):
        r = self.get_object()
        r.whatsapp_enviado_em = timezone.now()
        r.save(update_fields=["whatsapp_enviado_em"])
        return Response(ReajusteSerializer(r).data)
