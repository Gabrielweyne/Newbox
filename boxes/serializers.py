from rest_framework import serializers

from . import cobranca
from .models import Box, Cliente, Funcionario, Mensalidade, Sede
from .permissions import sede_do_usuario
from .validators import somente_digitos


class SedeSerializer(serializers.ModelSerializer):
    # Calculados a partir dos boxes (ver SedeViewSet.get_queryset)
    numero_de_box = serializers.IntegerField(read_only=True)
    alugados = serializers.IntegerField(read_only=True)
    nao_alugados = serializers.IntegerField(read_only=True)

    class Meta:
        model = Sede
        fields = ["id", "nome", "endereco", "numero_de_box", "alugados", "nao_alugados"]


class ClienteSerializer(serializers.ModelSerializer):
    total_boxes = serializers.IntegerField(read_only=True)

    class Meta:
        model = Cliente
        fields = ["id", "nome", "total_boxes"]


class BoxSerializer(serializers.ModelSerializer):
    alugado = serializers.BooleanField(read_only=True)
    sede_nome = serializers.CharField(source="sede.nome", read_only=True)
    cliente_nome = serializers.CharField(source="cliente.nome", read_only=True, default=None)
    # True se há mensalidade vencida e não paga (vem anotado em BoxViewSet)
    em_atraso = serializers.BooleanField(read_only=True, default=False)

    class Meta:
        model = Box
        fields = [
            "id", "sede", "sede_nome", "tamanho", "valor",
            "cliente", "cliente_nome", "anexo_pagamento", "dia_vencimento", "alugado_em",
            "alugado", "em_atraso",
        ]
        read_only_fields = ["alugado_em"]
        # Funcionário pode omitir a sede: usa a dele automaticamente
        extra_kwargs = {"sede": {"required": False}}

    def validate(self, attrs):
        self._validar_sede(attrs)
        atual = self.instance
        cliente = attrs.get("cliente", getattr(atual, "cliente", None))
        anexo = attrs.get("anexo_pagamento", getattr(atual, "anexo_pagamento", None))
        dia = attrs.get("dia_vencimento", getattr(atual, "dia_vencimento", None))
        if atual and atual.cliente_id and "cliente" in attrs and cliente and cliente.pk != atual.cliente_id:
            raise serializers.ValidationError(
                {"cliente": "Libere o box antes de alugar para outro cliente."}
            )
        if atual and atual.cliente_id and "cliente" in attrs and cliente is None:
            raise serializers.ValidationError(
                {"cliente": "Para encerrar o aluguel use a opção Liberar."}
            )
        if cliente and not dia:
            raise serializers.ValidationError(
                {"dia_vencimento": "Escolha o dia de vencimento da mensalidade."}
            )
        if dia and not cliente:
            raise serializers.ValidationError(
                {"cliente": "Obrigatório quando há dia de vencimento."}
            )
        if cliente and not anexo:
            raise serializers.ValidationError(
                {"anexo_pagamento": "Obrigatório quando o box está alugado."}
            )
        if anexo and not cliente:
            raise serializers.ValidationError(
                {"cliente": "Obrigatório quando há anexo de pagamento."}
            )
        return attrs

    def _usuario(self):
        request = self.context.get("request")
        return request.user if request and request.user.is_authenticated else None

    def create(self, dados):
        if dados.get("cliente"):
            dados["alugado_em"] = cobranca.hoje()
        box = super().create(dados)
        if box.alugado:
            cobranca.iniciar_aluguel(box, self._usuario())
        return box

    def update(self, box, dados):
        estava_livre = not box.alugado
        if estava_livre and dados.get("cliente"):
            dados["alugado_em"] = cobranca.hoje()
        box = super().update(box, dados)
        if estava_livre and box.alugado:
            cobranca.iniciar_aluguel(box, self._usuario())
        elif box.alugado and ({"valor", "dia_vencimento"} & dados.keys()):
            # Mensalidades futuras ainda não pagas acompanham o novo valor/dia
            for m in box.mensalidades.filter(pago_em__isnull=True, vencimento__gte=cobranca.hoje()):
                m.valor = box.valor
                m.vencimento = cobranca.data_vencimento(m.competencia, box.dia_vencimento)
                m.save(update_fields=["valor", "vencimento"])
        return box

    def _validar_sede(self, attrs):
        request = self.context.get("request")
        sede_permitida = sede_do_usuario(request.user) if request else None
        sede = attrs.get("sede", getattr(self.instance, "sede", None))

        if sede_permitida is None:  # administrador
            if sede is None:
                raise serializers.ValidationError({"sede": "Este campo é obrigatório."})
            return
        if sede is None:
            attrs["sede"] = Sede.objects.get(pk=sede_permitida)
        elif sede.pk != sede_permitida:
            raise serializers.ValidationError(
                {"sede": "Você só pode cadastrar boxes na sua sede."}
            )


class SedeOpcaoSerializer(serializers.ModelSerializer):
    """Versão mínima da sede, para o formulário de cadastro de funcionário."""

    class Meta:
        model = Sede
        fields = ["id", "nome"]


class FuncionarioSerializer(serializers.ModelSerializer):
    sede_nome = serializers.CharField(source="sede.nome", read_only=True)
    aprovado = serializers.BooleanField(read_only=True)
    email = serializers.EmailField(source="usuario.email", read_only=True)

    class Meta:
        model = Funcionario
        fields = ["id", "nome", "cpf", "email", "sede", "sede_nome", "aprovado"]
        extra_kwargs = {"cpf": {"max_length": 14}}  # aceita "000.000.000-00"

    def validate_cpf(self, valor):
        cpf = somente_digitos(valor)
        Funcionario._meta.get_field("cpf").run_validators(cpf)
        existe = Funcionario.objects.filter(cpf=cpf)
        if self.instance:
            existe = existe.exclude(pk=self.instance.pk)
        if existe.exists():
            raise serializers.ValidationError("Já existe funcionário com este CPF.")
        return cpf


class MensalidadeSerializer(serializers.ModelSerializer):
    box_tamanho = serializers.CharField(source="box.tamanho", read_only=True)
    sede = serializers.IntegerField(source="box.sede_id", read_only=True)
    sede_nome = serializers.CharField(source="box.sede.nome", read_only=True)
    cliente_nome = serializers.CharField(source="cliente.nome", read_only=True)
    situacao = serializers.SerializerMethodField()
    registrado_por_nome = serializers.SerializerMethodField()

    class Meta:
        model = Mensalidade
        fields = [
            "id", "box", "box_tamanho", "sede", "sede_nome", "cliente", "cliente_nome",
            "competencia", "vencimento", "valor", "pago_em", "comprovante",
            "situacao", "registrado_por_nome",
        ]
        read_only_fields = fields

    def get_situacao(self, obj):
        return obj.situacao(cobranca.hoje())

    def get_registrado_por_nome(self, obj):
        u = obj.registrado_por
        if not u:
            return None
        funcionario = getattr(u, "funcionario", None)
        return funcionario.nome if funcionario else (u.get_full_name() or "Administrador")


class PagamentoSerializer(serializers.Serializer):
    comprovante = serializers.FileField()
    pago_em = serializers.DateField(required=False)

    def validate_pago_em(self, valor):
        if valor > cobranca.hoje():
            raise serializers.ValidationError("A data do pagamento não pode ser no futuro.")
        return valor
