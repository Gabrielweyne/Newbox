from django.utils import timezone
from rest_framework import serializers

from . import cobranca
from .models import (
    Box,
    Cliente,
    Comunicado,
    Contrato,
    EnvioComunicado,
    Funcionario,
    Interessado,
    Mensalidade,
    Sede,
    TipoBox,
)
from .permissions import sede_do_usuario
from .validators import somente_digitos


class TipoBoxSerializer(serializers.ModelSerializer):
    sede_nome = serializers.CharField(source="sede.nome", read_only=True)
    total_boxes = serializers.IntegerField(read_only=True, default=None)

    class Meta:
        model = TipoBox
        fields = [
            "id", "sede", "sede_nome", "codigo", "area", "volume", "comprimento", "largura", "altura",
            "sugestao_uso", "valor", "ordem", "total_boxes",
        ]

    def validate_codigo(self, valor):
        return " ".join(valor.split()).upper()


class SedeSerializer(serializers.ModelSerializer):
    # Calculados a partir dos boxes (ver SedeViewSet.get_queryset)
    numero_de_box = serializers.IntegerField(read_only=True)
    alugados = serializers.IntegerField(read_only=True)
    nao_alugados = serializers.IntegerField(read_only=True)

    class Meta:
        model = Sede
        fields = ["id", "nome", "endereco", "numero_de_box", "alugados", "nao_alugados"]


def numero_br(valor):
    """Decimal('5.50') -> '5,5'"""
    return format(valor.normalize(), "f").replace(".", ",")


def limpar_telefone(valor):
    digitos = somente_digitos(valor)
    if len(digitos) in (12, 13) and digitos.startswith("55"):
        digitos = digitos[2:]
    if len(digitos) not in (10, 11):
        raise serializers.ValidationError("Informe DDD + número. Ex.: (85) 99999-9999")
    return digitos


class ClienteSerializer(serializers.ModelSerializer):
    total_boxes = serializers.IntegerField(read_only=True)
    atrasadas = serializers.IntegerField(read_only=True)

    class Meta:
        model = Cliente
        fields = [
            "id", "nome", "telefone", "cpf", "email", "endereco", "ativo", "excluido_em", "total_boxes", "atrasadas",
        ]
        read_only_fields = ["ativo", "excluido_em"]
        extra_kwargs = {
            "telefone": {
                "max_length": 25, "required": True, "allow_blank": False,
                "error_messages": {
                    "blank": "Informe o WhatsApp do cliente.",
                    "required": "Informe o WhatsApp do cliente.",
                },
            },
            "cpf": {"max_length": 18, "required": False},  # aceita CPF ou CNPJ com pontuação
            "email": {
                "required": True, "allow_blank": False,
                "error_messages": {
                    "blank": "Informe o e-mail do cliente.",
                    "required": "Informe o e-mail do cliente.",
                },
            },
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Clientes antigos podem não ter WhatsApp/e-mail: na edição parcial não são exigidos
        if self.instance is not None and self.partial:
            self.fields["telefone"].required = False
            self.fields["email"].required = False

    def validate_telefone(self, valor):
        return limpar_telefone(valor)

    def validate_cpf(self, valor):
        cpf = somente_digitos(valor)
        if not cpf:
            return ""
        Cliente._meta.get_field("cpf").run_validators(cpf)
        existe = Cliente.objects.filter(cpf=cpf)
        if self.instance:
            existe = existe.exclude(pk=self.instance.pk)
        if outro := existe.first():
            if not outro.ativo:
                raise serializers.ValidationError(
                    f"Este CPF é de {outro.nome}, que é ex-cliente. Escolha {outro.nome} na lista em vez de cadastrar de novo."
                )
            raise serializers.ValidationError(f"Já existe cliente com este {'CNPJ' if len(cpf) == 14 else 'CPF'}: {outro.nome}.")
        return cpf

    def validate_email(self, valor):
        return (valor or "").strip().lower()

    def validate_endereco(self, valor):
        return " ".join((valor or "").split())


class BoxSerializer(serializers.ModelSerializer):
    alugado = serializers.BooleanField(read_only=True)
    sede_nome = serializers.CharField(source="sede.nome", read_only=True)
    cliente_nome = serializers.CharField(source="cliente.nome", read_only=True, default=None)
    # True se há mensalidade vencida e não paga (vem anotado em BoxViewSet)
    em_atraso = serializers.BooleanField(read_only=True, default=False)
    # id do contrato ativo (vem anotado em BoxViewSet)
    contrato_ativo = serializers.IntegerField(read_only=True, default=None)
    # Ao alugar para alguém da lista de espera: a pessoa sai da lista como "Alugou"
    interessado = serializers.PrimaryKeyRelatedField(
        queryset=Interessado.objects.all(), required=False, allow_null=True, write_only=True
    )

    class Meta:
        model = Box
        fields = [
            "id", "numero", "sede", "sede_nome", "tipo", "tipo_detalhe", "tamanho", "valor", "observacao",
            "cliente", "cliente_nome", "anexo_pagamento", "dia_vencimento", "alugado_em",
            "alugado", "em_atraso", "contrato_ativo", "interessado",
        ]
        read_only_fields = ["alugado_em"]
        validators = []  # número repetido na sede é checado em validate(), com mensagem clara
        # Funcionário pode omitir a sede: usa a dele automaticamente.
        # Com um tipo do catálogo, tamanho e valor vêm dele se não forem informados.
        extra_kwargs = {"sede": {"required": False}, "tamanho": {"required": False}, "valor": {"required": False}}

    tipo_detalhe = serializers.SerializerMethodField()

    def get_tipo_detalhe(self, obj):
        t = obj.tipo
        if not t:
            return None
        return {
            "codigo": t.codigo, "area": t.area, "volume": t.volume,
            "dimensoes": " x ".join(numero_br(n) for n in (t.comprimento, t.largura, t.altura)) + " m",
            "sugestao_uso": t.sugestao_uso, "valor_catalogo": t.valor,
        }

    def validate_numero(self, valor):
        return " ".join((valor or "").split())

    def validate(self, attrs):
        self._validar_sede(attrs)
        numero = attrs.get("numero", getattr(self.instance, "numero", ""))
        sede = attrs.get("sede", getattr(self.instance, "sede", None))
        if numero and sede:
            repetido = Box.objects.filter(sede=sede, numero=numero)
            if self.instance:
                repetido = repetido.exclude(pk=self.instance.pk)
            if repetido.exists():
                raise serializers.ValidationError({"numero": f"Já existe o box {numero} nesta sede."})
        self._aplicar_tipo(attrs)
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
        if attrs.get("interessado") and not (cliente and "cliente" in attrs and not getattr(atual, "cliente_id", None)):
            raise serializers.ValidationError(
                {"interessado": "Só dá para indicar alguém da lista de espera ao alugar um box livre."}
            )
        if anexo and not cliente:
            raise serializers.ValidationError(
                {"cliente": "Obrigatório quando há anexo de pagamento."}
            )
        return attrs

    def _aplicar_tipo(self, attrs):
        tipo = attrs.get("tipo", getattr(self.instance, "tipo", None))
        sede = attrs.get("sede", getattr(self.instance, "sede", None))
        if tipo and sede and tipo.sede_id != sede.pk:
            raise serializers.ValidationError({"tipo": "Este tamanho é do catálogo de outra unidade."})
        if "tipo" in attrs and tipo:
            attrs["tamanho"] = tipo.codigo
            if "valor" not in attrs and not self.instance:
                attrs["valor"] = tipo.valor
        if not self.instance:
            erros = {}
            if not attrs.get("tamanho"):
                erros["tamanho"] = "Escolha um tamanho do catálogo ou informe o tamanho."
            if attrs.get("valor") is None:
                erros["valor"] = "Este campo é obrigatório."
            if erros:
                raise serializers.ValidationError(erros)

    def _usuario(self):
        request = self.context.get("request")
        return request.user if request and request.user.is_authenticated else None

    def _tirar_da_espera(self, interessado, box):
        if not interessado:
            return
        interessado.situacao = Interessado.ALUGOU
        interessado.cliente = box.cliente
        interessado.contatado_em = interessado.contatado_em or timezone.now()
        interessado.save(update_fields=["situacao", "cliente", "contatado_em"])

    def create(self, dados):
        interessado = dados.pop("interessado", None)
        if dados.get("cliente"):
            dados["alugado_em"] = cobranca.hoje()
        box = super().create(dados)
        if box.alugado:
            cobranca.iniciar_aluguel(box, self._usuario())
            self._tirar_da_espera(interessado, box)
        return box

    def update(self, box, dados):
        interessado = dados.pop("interessado", None)
        estava_livre = not box.alugado
        if estava_livre and dados.get("cliente"):
            dados["alugado_em"] = cobranca.hoje()
        box = super().update(box, dados)
        if estava_livre and box.alugado:
            if not box.cliente.ativo:  # ex-cliente alugando de novo volta a ser cliente
                box.cliente.ativo, box.cliente.excluido_em = True, None
                box.cliente.save(update_fields=["ativo", "excluido_em"])
            cobranca.iniciar_aluguel(box, self._usuario())
            self._tirar_da_espera(interessado, box)
        elif box.alugado and ({"valor", "dia_vencimento"} & dados.keys()):
            # Mensalidades futuras ainda não pagas acompanham o novo valor/dia
            for m in box.mensalidades.filter(pago_em__isnull=True, vencimento__gte=cobranca.hoje()):
                m.valor = box.valor
                m.vencimento = cobranca.data_vencimento(m.competencia, box.dia_vencimento)
                m.save(update_fields=["valor", "vencimento"])
            box.contratos.filter(fim__isnull=True).update(valor=box.valor, dia_vencimento=box.dia_vencimento)
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
    box_numero = serializers.CharField(source="box.numero", read_only=True)
    sede = serializers.IntegerField(source="box.sede_id", read_only=True)
    sede_nome = serializers.CharField(source="box.sede.nome", read_only=True)
    cliente_nome = serializers.CharField(source="cliente.nome", read_only=True)
    cliente_telefone = serializers.CharField(source="cliente.telefone", read_only=True)
    cliente_email = serializers.CharField(source="cliente.email", read_only=True)
    situacao = serializers.SerializerMethodField()
    registrado_por_nome = serializers.SerializerMethodField()

    class Meta:
        model = Mensalidade
        fields = [
            "id", "box", "box_numero", "box_tamanho", "sede", "sede_nome", "cliente", "cliente_nome", "cliente_telefone",
            "competencia", "vencimento", "valor", "pago_em", "comprovante",
            "situacao", "registrado_por_nome",
            "nota_fiscal", "nota_numero", "nota_enviada_em", "nota_enviada_para", "cliente_email",
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


class VagaSerializer(serializers.ModelSerializer):
    sede_nome = serializers.CharField(source="sede.nome", read_only=True)

    class Meta:
        model = Box
        fields = ["id", "numero", "sede", "sede_nome", "tamanho", "valor"]


class InteressadoSerializer(serializers.ModelSerializer):
    sede_nome = serializers.CharField(source="sede.nome", read_only=True, default=None)
    criado_por_nome = serializers.SerializerMethodField()
    # Boxes livres agora que servem para esta pessoa (qualquer sede)
    vagas = serializers.SerializerMethodField()

    class Meta:
        model = Interessado
        fields = [
            "id", "nome", "telefone", "email", "sede", "sede_nome", "tamanho", "observacao",
            "situacao", "criado_em", "contatado_em", "criado_por_nome", "vagas", "cliente",
        ]
        read_only_fields = ["criado_em", "contatado_em", "cliente"]
        extra_kwargs = {
            "telefone": {"max_length": 25},  # aceita "(85) 99999-9999"
            "email": {
                "required": True, "allow_blank": False,
                "error_messages": {
                    "blank": "Informe o e-mail. Ele vira o e-mail do cliente quando alugar.",
                    "required": "Informe o e-mail. Ele vira o e-mail do cliente quando alugar.",
                },
            },
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Anotações antigas podem não ter e-mail: mudar só a situação não exige
        if self.instance is not None and self.partial:
            self.fields["email"].required = False

    def validate_telefone(self, valor):
        return limpar_telefone(valor)

    def validate_email(self, valor):
        return (valor or "").strip().lower()

    def validate_tamanho(self, valor):
        return (valor or "").strip()

    def get_criado_por_nome(self, obj):
        u = obj.criado_por
        if not u:
            return None
        f = getattr(u, "funcionario", None)
        return f.nome if f else "Administrador"

    def get_vagas(self, obj):
        from .espera import vagas_para

        livres = self.context.get("livres")
        if livres is None:
            from .espera import boxes_livres

            livres = boxes_livres()
        if obj.situacao in (Interessado.ALUGOU, Interessado.DESISTIU):
            return []
        return VagaSerializer(vagas_para(obj, livres), many=True).data


class ContratoSerializer(serializers.ModelSerializer):
    numero = serializers.CharField(read_only=True)
    ativo = serializers.BooleanField(read_only=True)
    cliente_nome = serializers.CharField(source="cliente.nome", read_only=True)
    sede = serializers.IntegerField(source="box.sede_id", read_only=True)
    sede_nome = serializers.CharField(source="box.sede.nome", read_only=True)
    duracao = serializers.SerializerMethodField()
    box_numero = serializers.CharField(source="box.numero", read_only=True)

    class Meta:
        model = Contrato
        fields = [
            "id", "numero", "box", "box_numero", "sede", "sede_nome", "cliente", "cliente_nome", "tamanho",
            "valor", "dia_vencimento", "inicio", "fim", "ativo", "duracao",
        ]
        read_only_fields = fields

    def get_duracao(self, obj):
        return cobranca.duracao(obj.inicio, obj.fim)


class NotaFiscalSerializer(serializers.Serializer):
    arquivo = serializers.FileField(required=False)
    numero = serializers.CharField(max_length=30, required=False, allow_blank=True)

    def validate_arquivo(self, arquivo):
        if not arquivo.name.lower().endswith(".pdf"):
            raise serializers.ValidationError("Envie a nota fiscal em PDF.")
        if arquivo.size > 10 * 1024 * 1024:
            raise serializers.ValidationError("Arquivo muito grande (máximo 10 MB).")
        return arquivo


class ComunicadoSerializer(serializers.ModelSerializer):
    sede_nome = serializers.CharField(source="sede.nome", read_only=True, default=None)
    criado_por_nome = serializers.SerializerMethodField()
    resumo = serializers.SerializerMethodField()

    class Meta:
        model = Comunicado
        fields = [
            "id", "titulo", "mensagem", "publico", "sede", "sede_nome", "por_email", "por_whatsapp",
            "criado_em", "criado_por_nome", "resumo",
        ]
        read_only_fields = ["criado_em"]

    def validate(self, attrs):
        if not attrs.get("por_email", True) and not attrs.get("por_whatsapp", True):
            raise serializers.ValidationError({"por_email": "Escolha pelo menos um canal."})
        request = self.context.get("request")
        minha = sede_do_usuario(request.user) if request else None
        if minha is not None:
            # Funcionário só envia para clientes da própria unidade
            if attrs.get("sede") and attrs["sede"].pk != minha:
                raise serializers.ValidationError({"sede": "Você só pode enviar para clientes da sua unidade."})
            attrs["sede"] = Sede.objects.get(pk=minha)
        return attrs

    def get_criado_por_nome(self, obj):
        u = obj.criado_por
        if not u:
            return None
        f = getattr(u, "funcionario", None)
        return f.nome if f else "Administrador"

    def get_resumo(self, obj):
        contagem = {}
        for email, zap in obj.envios.values_list("email_situacao", "whatsapp_situacao"):
            contagem[("email", email)] = contagem.get(("email", email), 0) + 1
            contagem[("whatsapp", zap)] = contagem.get(("whatsapp", zap), 0) + 1
        c = lambda canal, sit: contagem.get((canal, sit), 0)  # noqa: E731
        return {
            "total": obj.envios.count(),
            "email_enviados": c("email", "enviado"),
            "email_falhos": c("email", "falhou"),
            "sem_email": c("email", "sem_contato"),
            "whatsapp_enviados": c("whatsapp", "enviado"),
            "whatsapp_pendentes": c("whatsapp", "pendente"),
            "sem_whatsapp": c("whatsapp", "sem_contato"),
        }


class EnvioComunicadoSerializer(serializers.ModelSerializer):
    cliente_nome = serializers.CharField(source="cliente.nome", read_only=True)
    texto = serializers.SerializerMethodField()

    class Meta:
        model = EnvioComunicado
        fields = [
            "id", "cliente", "cliente_nome", "email", "telefone", "email_situacao",
            "whatsapp_situacao", "whatsapp_enviado_em", "texto",
        ]

    def get_texto(self, obj):
        return obj.comunicado.texto_para(obj.cliente)
