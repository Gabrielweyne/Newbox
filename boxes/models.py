from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models
from django.db.models import Q

from .cobranca import DIAS_VENCIMENTO
from .validators import validar_cpf


class Sede(models.Model):
    """Unidade da Newbox. Uma sede tem muitos boxes."""

    nome = models.CharField("nome da sede", max_length=120, unique=True)
    nome_publico = models.CharField(
        "nome na página pública", max_length=120, blank=True,
        help_text='Ex.: "Newbox Sede (Cambeba)". Vazio = usa o nome.',
    )
    endereco = models.CharField("endereço", max_length=255)
    whatsapp = models.CharField(
        "WhatsApp da unidade", max_length=13, blank=True, help_text="Só números, com 55 + DDD."
    )
    criado_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["nome"]
        constraints = [
            models.CheckConstraint(
                condition=~Q(nome__regex=r"^\s*$"), name="sede_nome_preenchido"
            ),
            models.CheckConstraint(
                condition=~Q(endereco__regex=r"^\s*$"), name="sede_endereco_preenchido"
            ),
        ]

    def __str__(self):
        return self.nome


class TipoBox(models.Model):
    """
    Tamanho de box do catálogo de uma unidade (P1, P2, M1, G1...).
    Medidas e preço mudam de uma unidade para outra.
    """

    sede = models.ForeignKey(Sede, on_delete=models.CASCADE, related_name="tipos")
    codigo = models.CharField("código", max_length=20, help_text='Ex.: "P1", "M1 SUP", "G2".')
    area = models.DecimalField("área (m²)", max_digits=6, decimal_places=2)
    volume = models.DecimalField("volume (m³)", max_digits=6, decimal_places=2)
    comprimento = models.DecimalField(max_digits=5, decimal_places=2)
    largura = models.DecimalField(max_digits=5, decimal_places=2)
    altura = models.DecimalField(max_digits=5, decimal_places=2)
    sugestao_uso = models.CharField("sugestão de uso", max_length=200)
    valor = models.DecimalField("valor mensal", max_digits=10, decimal_places=2, validators=[MinValueValidator(0)])
    ordem = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["sede", "ordem", "id"]
        verbose_name = "tipo de box"
        verbose_name_plural = "tipos de box (catálogo)"
        constraints = [
            models.UniqueConstraint(fields=["sede", "codigo"], name="tipo_codigo_unico_por_sede"),
            models.CheckConstraint(condition=~Q(codigo__regex=r"^\s*$"), name="tipo_codigo_preenchido"),
            models.CheckConstraint(
                condition=Q(area__gt=0) & Q(volume__gt=0) & Q(comprimento__gt=0) & Q(largura__gt=0) & Q(altura__gt=0),
                name="tipo_medidas_positivas",
            ),
            models.CheckConstraint(condition=Q(valor__gte=0), name="tipo_valor_positivo"),
        ]

    @property
    def nome(self):
        return f"Box {self.codigo}"

    def __str__(self):
        return f"{self.nome} ({self.sede})"


class Cliente(models.Model):
    """
    Cliente que aluga boxes. Um cliente pode ter muitos boxes.

    WhatsApp é obrigatório para clientes novos (validado na API); clientes
    antigos podem estar sem, até alguém completar o cadastro.
    """

    nome = models.CharField(max_length=150)
    telefone = models.CharField("WhatsApp", max_length=11, blank=True, help_text="DDD + número, só dígitos.")
    cpf = models.CharField("CPF", max_length=11, blank=True, validators=[validar_cpf])
    email = models.EmailField("e-mail", blank=True)
    criado_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["nome"]
        constraints = [
            models.CheckConstraint(
                condition=~Q(nome__regex=r"^\s*$"), name="cliente_nome_preenchido"
            ),
            models.CheckConstraint(
                condition=Q(telefone="") | Q(telefone__regex=r"^[0-9]{10,11}$"),
                name="cliente_telefone_valido",
            ),
            models.CheckConstraint(
                condition=Q(cpf="") | Q(cpf__regex=r"^[0-9]{11}$"), name="cliente_cpf_11_digitos"
            ),
            models.UniqueConstraint(
                fields=["cpf"], condition=~Q(cpf=""), name="cliente_cpf_unico"
            ),
        ]

    def __str__(self):
        return self.nome




class Box(models.Model):
    """
    Box de uma sede.

    Box alugado: cliente, anexo de pagamento, dia de vencimento e data de
    início são obrigatórios juntos.
    Box livre: todos ficam vazios (é o que conta como "não alugado").
    """

    sede = models.ForeignKey(Sede, on_delete=models.PROTECT, related_name="boxes")
    tipo = models.ForeignKey(
        "TipoBox", on_delete=models.PROTECT, null=True, blank=True, related_name="boxes",
        help_text="Tamanho do catálogo. Ao escolher, o código vira o tamanho do box.",
    )
    tamanho = models.CharField(max_length=50)
    valor = models.DecimalField(
        max_digits=10, decimal_places=2, validators=[MinValueValidator(0)]
    )
    cliente = models.ForeignKey(
        Cliente,
        verbose_name="cliente que aluga",
        on_delete=models.PROTECT,
        related_name="boxes",
        null=True,
        blank=True,
    )
    anexo_pagamento = models.FileField(
        "anexo de pagamento", upload_to="comprovantes/%Y/%m/", null=True, blank=True
    )
    dia_vencimento = models.PositiveSmallIntegerField(
        "dia de vencimento",
        choices=[(d, f"Dia {d}") for d in DIAS_VENCIMENTO],
        null=True,
        blank=True,
        help_text="Dia do mês em que a mensalidade vence. Em meses mais curtos, "
        "o dia 30 passa para o último dia do mês.",
    )
    alugado_em = models.DateField("alugado em", null=True, blank=True)
    criado_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["sede", "id"]
        verbose_name_plural = "boxes"
        constraints = [
            models.CheckConstraint(
                condition=~Q(tamanho__regex=r"^\s*$"), name="box_tamanho_preenchido"
            ),
            models.CheckConstraint(condition=Q(valor__gte=0), name="box_valor_positivo"),
            models.CheckConstraint(
                condition=(
                    Q(cliente__isnull=True)
                    & (Q(anexo_pagamento__isnull=True) | Q(anexo_pagamento=""))
                )
                | (
                    Q(cliente__isnull=False)
                    & Q(anexo_pagamento__isnull=False)
                    & ~Q(anexo_pagamento="")
                ),
                name="box_aluguel_completo",
            ),
            models.CheckConstraint(
                condition=(
                    Q(cliente__isnull=True) & Q(dia_vencimento__isnull=True) & Q(alugado_em__isnull=True)
                )
                | (
                    Q(cliente__isnull=False)
                    & Q(dia_vencimento__in=DIAS_VENCIMENTO)
                    & Q(alugado_em__isnull=False)
                ),
                name="box_aluguel_com_vencimento",
            ),
        ]

    @property
    def alugado(self):
        return self.cliente_id is not None

    def __str__(self):
        return f"Box {self.pk} - {self.sede} ({self.tamanho})"


class Funcionario(models.Model):
    """
    Funcionário da Newbox, vinculado à sede onde trabalha.

    O login é feito com CPF e senha: cada funcionário tem um usuário do Django
    (username = CPF). A conta nasce inativa e precisa ser aprovada no /admin/.
    """

    usuario = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="funcionario"
    )
    nome = models.CharField(max_length=150)
    cpf = models.CharField(
        "CPF", max_length=11, unique=True, validators=[validar_cpf],
        help_text="Somente números (11 dígitos).",
    )
    sede = models.ForeignKey(Sede, on_delete=models.PROTECT, related_name="funcionarios")
    criado_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["nome"]
        verbose_name = "funcionário"
        constraints = [
            models.CheckConstraint(
                condition=~Q(nome__regex=r"^\s*$"), name="funcionario_nome_preenchido"
            ),
            models.CheckConstraint(
                condition=Q(cpf__regex=r"^[0-9]{11}$"), name="funcionario_cpf_11_digitos"
            ),
        ]

    @property
    def aprovado(self):
        return self.usuario.is_active

    def __str__(self):
        return f"{self.nome} ({self.sede})"


class Mensalidade(models.Model):
    """
    Cobrança mensal de um box alugado.

    Uma por box por mês (competência). É gerada automaticamente pelo sistema
    (ver boxes/cobranca.py). Paga = tem data de pagamento e comprovante.
    """

    box = models.ForeignKey(Box, on_delete=models.CASCADE, related_name="mensalidades")
    cliente = models.ForeignKey(Cliente, on_delete=models.PROTECT, related_name="mensalidades")
    competencia = models.DateField("mês de referência", help_text="Sempre o dia 1 do mês.")
    vencimento = models.DateField()
    valor = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(0)])
    pago_em = models.DateField("pago em", null=True, blank=True)
    comprovante = models.FileField(upload_to="comprovantes/%Y/%m/", null=True, blank=True)
    registrado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="+", verbose_name="pagamento registrado por",
    )
    # Nota fiscal emitida fora do sistema (prefeitura/contador) e enviada ao cliente por e-mail
    nota_fiscal = models.FileField("nota fiscal (PDF)", upload_to="notas/%Y/%m/", null=True, blank=True)
    nota_numero = models.CharField("número da nota", max_length=30, blank=True)
    nota_enviada_em = models.DateTimeField("nota enviada em", null=True, blank=True)
    nota_enviada_para = models.EmailField("nota enviada para", blank=True)
    criado_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["vencimento", "box_id"]
        constraints = [
            models.UniqueConstraint(fields=["box", "competencia"], name="mensalidade_unica_por_mes"),
            models.CheckConstraint(condition=Q(competencia__day=1), name="mensalidade_competencia_dia_1"),
            models.CheckConstraint(condition=Q(valor__gte=0), name="mensalidade_valor_positivo"),
            models.CheckConstraint(
                condition=(Q(pago_em__isnull=True) & (Q(comprovante__isnull=True) | Q(comprovante="")))
                | (Q(pago_em__isnull=False) & Q(comprovante__isnull=False) & ~Q(comprovante="")),
                name="mensalidade_paga_com_comprovante",
            ),
        ]
        indexes = [models.Index(fields=["vencimento", "pago_em"])]

    @property
    def pago(self):
        return self.pago_em is not None

    def situacao(self, hoje):
        if self.pago_em:
            return "paga"
        if self.vencimento < hoje:
            return "atrasada"
        if self.vencimento == hoje:
            return "vence_hoje"
        return "a_vencer"

    def __str__(self):
        return f"Box {self.box_id} - {self.competencia:%m/%Y}"


class Interessado(models.Model):
    """
    Lista de espera: pessoa que quer um box, mas não havia vaga quando chamou.

    sede vazia = aceita qualquer unidade; tamanho vazio = aceita qualquer tamanho.
    A lista é compartilhada entre as sedes.
    """

    AGUARDANDO = "aguardando"
    CONTATADO = "contatado"
    ALUGOU = "alugou"
    DESISTIU = "desistiu"
    SITUACOES = [
        (AGUARDANDO, "Aguardando vaga"),
        (CONTATADO, "Contatado"),
        (ALUGOU, "Alugou"),
        (DESISTIU, "Desistiu"),
    ]

    nome = models.CharField(max_length=150)
    telefone = models.CharField("WhatsApp", max_length=11, help_text="DDD + número, só dígitos.")
    sede = models.ForeignKey(
        Sede, on_delete=models.SET_NULL, null=True, blank=True, related_name="interessados",
        help_text="Vazio = qualquer unidade.",
    )
    tamanho = models.CharField(max_length=50, blank=True, help_text="Vazio = qualquer tamanho.")
    observacao = models.CharField("observação", max_length=300, blank=True)
    situacao = models.CharField("situação", max_length=12, choices=SITUACOES, default=AGUARDANDO)
    criado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    criado_em = models.DateTimeField(auto_now_add=True)
    contatado_em = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["criado_em"]
        constraints = [
            models.CheckConstraint(condition=~Q(nome__regex=r"^\s*$"), name="interessado_nome_preenchido"),
            models.CheckConstraint(condition=Q(telefone__regex=r"^[0-9]{10,11}$"), name="interessado_telefone_valido"),
        ]

    def __str__(self):
        return f"{self.nome} ({self.get_situacao_display()})"


class Contrato(models.Model):
    """
    Um aluguel de box, do início ao fim. Fica como histórico depois que o box
    é liberado. Só pode haver um contrato ativo (sem data de fim) por box.
    Os valores são uma "foto" do momento do aluguel (atualizados se o box
    tiver valor ou vencimento alterados enquanto o contrato está ativo).
    """

    box = models.ForeignKey(Box, on_delete=models.PROTECT, related_name="contratos")
    cliente = models.ForeignKey(Cliente, on_delete=models.PROTECT, related_name="contratos")
    tamanho = models.CharField(max_length=50)
    valor = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(0)])
    dia_vencimento = models.PositiveSmallIntegerField(choices=[(d, f"Dia {d}") for d in DIAS_VENCIMENTO])
    inicio = models.DateField("início")
    fim = models.DateField(null=True, blank=True, help_text="Vazio enquanto o contrato está ativo.")
    criado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    encerrado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    criado_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-inicio", "-id"]
        constraints = [
            models.UniqueConstraint(
                fields=["box"], condition=Q(fim__isnull=True), name="contrato_um_ativo_por_box"
            ),
            models.CheckConstraint(
                condition=Q(fim__isnull=True) | Q(fim__gte=models.F("inicio")), name="contrato_fim_apos_inicio"
            ),
        ]

    @property
    def ativo(self):
        return self.fim is None

    @property
    def numero(self):
        return f"{self.inicio:%Y}-{self.pk:05d}"

    def __str__(self):
        return f"Contrato {self.numero} - {self.cliente} (box {self.box_id})"
