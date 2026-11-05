from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models
from django.db.models import Q

from .cobranca import DIAS_VENCIMENTO
from .validators import validar_cpf


class Sede(models.Model):
    """Unidade da Newbox. Uma sede tem muitos boxes."""

    nome = models.CharField("nome da sede", max_length=120, unique=True)
    endereco = models.CharField("endereço", max_length=255)
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


class Cliente(models.Model):
    """Cliente que aluga boxes. Um cliente pode ter muitos boxes."""

    nome = models.CharField(max_length=150)
    criado_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["nome"]
        constraints = [
            models.CheckConstraint(
                condition=~Q(nome__regex=r"^\s*$"), name="cliente_nome_preenchido"
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
