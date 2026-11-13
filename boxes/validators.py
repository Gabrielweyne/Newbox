import re

from django.core.exceptions import ValidationError


def somente_digitos(valor):
    return re.sub(r"\D", "", valor or "")


def cnpj_valido(cnpj):
    if len(cnpj) != 14 or cnpj == cnpj[0] * 14:
        return False
    for tamanho in (12, 13):
        pesos = list(range(tamanho - 7, 1, -1)) + list(range(9, 1, -1))
        soma = sum(int(cnpj[i]) * pesos[i] for i in range(tamanho))
        digito = 0 if soma % 11 < 2 else 11 - soma % 11
        if digito != int(cnpj[tamanho]):
            return False
    return True


def validar_documento(valor):
    """CPF (11 dígitos) ou CNPJ (14 dígitos), com dígitos verificadores."""
    doc = somente_digitos(valor)
    if len(doc) == 14:
        if not cnpj_valido(doc):
            raise ValidationError("CNPJ inválido.")
        return
    if len(doc) != 11:
        raise ValidationError("Informe um CPF (11 dígitos) ou CNPJ (14 dígitos).")
    validar_cpf(doc)


def validar_cpf(valor):
    """Valida os dígitos verificadores do CPF (aceita com ou sem pontuação)."""
    cpf = somente_digitos(valor)
    if len(cpf) != 11 or cpf == cpf[0] * 11:
        raise ValidationError("CPF inválido.")
    for tamanho in (9, 10):
        soma = sum(int(cpf[i]) * (tamanho + 1 - i) for i in range(tamanho))
        digito = (soma * 10) % 11 % 10
        if digito != int(cpf[tamanho]):
            raise ValidationError("CPF inválido.")
