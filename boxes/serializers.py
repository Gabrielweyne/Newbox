from rest_framework import serializers

from .models import Box, Cliente, Funcionario, Sede
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
    class Meta:
        model = Cliente
        fields = ["id", "nome"]


class BoxSerializer(serializers.ModelSerializer):
    alugado = serializers.BooleanField(read_only=True)

    class Meta:
        model = Box
        fields = ["id", "sede", "tamanho", "valor", "cliente", "anexo_pagamento", "alugado"]
        # Funcionário pode omitir a sede: usa a dele automaticamente
        extra_kwargs = {"sede": {"required": False}}

    def validate(self, attrs):
        self._validar_sede(attrs)
        cliente = attrs.get("cliente", getattr(self.instance, "cliente", None))
        anexo = attrs.get("anexo_pagamento", getattr(self.instance, "anexo_pagamento", None))
        if cliente and not anexo:
            raise serializers.ValidationError(
                {"anexo_pagamento": "Obrigatório quando o box está alugado."}
            )
        if anexo and not cliente:
            raise serializers.ValidationError(
                {"cliente": "Obrigatório quando há anexo de pagamento."}
            )
        return attrs

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

    class Meta:
        model = Funcionario
        fields = ["id", "nome", "cpf", "sede", "sede_nome", "aprovado"]
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
