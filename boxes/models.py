from django.core.validators import MinValueValidator
from django.db import models
from django.db.models import Q

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

    Box alugado: cliente e anexo de pagamento são obrigatórios juntos.
    Box livre: os dois ficam vazios (é o que conta como "não alugado").
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
        ]

    @property
    def alugado(self):
        return self.cliente_id is not None

    def __str__(self):
        return f"Box {self.pk} - {self.sede} ({self.tamanho})"


class Funcionario(models.Model):
    """Funcionário da Newbox, vinculado à sede onde trabalha."""

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

    def __str__(self):
        return f"{self.nome} ({self.sede})"
