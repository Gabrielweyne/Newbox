from rest_framework import serializers

from .models import Box, Cliente, Sede


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

    def validate(self, attrs):
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
