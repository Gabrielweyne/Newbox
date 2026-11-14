"""
Reajuste de valor dos boxes.

- criar(): registra o reajuste de cada box, avisa o cliente por e-mail e, se o
  mês de início já chegou, aplica na hora.
- aplicar_pendentes(): chamado antes de gerar mensalidades; aplica os reajustes
  cujo mês chegou (box, contrato e mensalidades ainda não pagas daquele mês em diante).
"""

from decimal import ROUND_HALF_UP, Decimal

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.db import transaction
from django.template.loader import render_to_string
from django.utils import timezone

from . import cobranca

MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto",
         "setembro", "outubro", "novembro", "dezembro"]


def moeda(v):
    return f"R$ {v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def nome_mes(d):
    return f"{MESES[d.month - 1]} de {d.year}"


def novo_valor(atual, modo, valor=None, percentual=None):
    if modo == "percentual":
        return (atual * (Decimal("1") + Decimal(str(percentual)) / 100)).quantize(Decimal("0.01"), ROUND_HALF_UP)
    return Decimal(str(valor)).quantize(Decimal("0.01"))


def contexto(r):
    box = r.box
    primeiro = cobranca.data_vencimento(r.vigencia, box.dia_vencimento or 5)
    return {
        "nome": r.cliente.nome.split()[0],
        "box": box.numero or f"#{box.pk}",
        "tamanho": box.tamanho,
        "unidade": box.sede.nome_publico or box.sede.nome,
        "valor_anterior": moeda(r.valor_anterior),
        "valor_novo": moeda(r.valor_novo),
        "mes": nome_mes(r.vigencia),
        "primeiro_vencimento": f"{primeiro:%d/%m/%Y}",
        "mensagem": r.mensagem,
        "whatsapp": settings.NEWBOX_WHATSAPP,
    }


def texto_whatsapp(r):
    c = contexto(r)
    texto = (
        f"Olá, {c['nome']}! Aqui é da Newbox, unidade {c['unidade']}.\n"
        f"Informamos que a mensalidade do box {c['box']} ({c['tamanho']}) será reajustada "
        f"de {c['valor_anterior']} para {c['valor_novo']} a partir de {c['mes']} "
        f"(vencimento em {c['primeiro_vencimento']})."
    )
    if r.mensagem:
        texto += f"\n{r.mensagem}"
    return texto + "\nQualquer dúvida, estamos à disposição. Obrigado por guardar com a Newbox!"


def enviar_email(r):
    """Avisa o cliente por e-mail. Guarda o resultado (enviado ou o erro); não levanta exceção."""
    if not r.cliente.email:
        r.email_erro = "Cliente sem e-mail cadastrado."
        r.save(update_fields=["email_erro"])
        return False
    c = contexto(r)
    email = EmailMultiAlternatives(
        subject=f"Newbox - Reajuste da mensalidade do box {c['box']}",
        body=render_to_string("emails/reajuste.txt", c),
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[r.cliente.email],
    )
    email.attach_alternative(render_to_string("emails/reajuste.html", c), "text/html")
    try:
        email.send()
    except Exception as e:  # noqa: BLE001
        r.email_erro = f"Não foi possível enviar: {e}"[:300]
        r.save(update_fields=["email_erro"])
        return False
    r.email_enviado_em, r.email_erro = timezone.now(), ""
    r.save(update_fields=["email_enviado_em", "email_erro"])
    return True


@transaction.atomic
def aplicar(r):
    """Coloca o novo valor no box, no contrato e nas mensalidades não pagas do mês de início em diante."""
    from .models import Box

    box = Box.objects.select_for_update().get(pk=r.box_id)
    if box.cliente_id != r.cliente_id:  # o box foi liberado antes do reajuste valer
        r.cancelado_em = timezone.now()
        r.save(update_fields=["cancelado_em"])
        return
    box.valor = r.valor_novo
    box.save(update_fields=["valor"])
    box.contratos.filter(fim__isnull=True).update(valor=r.valor_novo)
    box.mensalidades.filter(pago_em__isnull=True, competencia__gte=r.vigencia).update(valor=r.valor_novo)
    r.aplicado_em = timezone.now()
    r.save(update_fields=["aplicado_em"])


def aplicar_pendentes():
    from .models import Reajuste

    mes_atual = cobranca.inicio_do_mes(cobranca.hoje())
    for r in Reajuste.objects.filter(aplicado_em__isnull=True, cancelado_em__isnull=True, vigencia__lte=mes_atual):
        aplicar(r)


def criar(boxes, modo, vigencia, usuario, valor=None, percentual=None, mensagem="", enviar=True):
    """Cria um reajuste por box (já validados), avisa e aplica os que já valem. Devolve a lista."""
    from .models import Reajuste

    criados = []
    with transaction.atomic():
        for box in boxes:
            criados.append(Reajuste.objects.create(
                box=box, cliente=box.cliente, valor_anterior=box.valor,
                valor_novo=novo_valor(box.valor, modo, valor, percentual),
                vigencia=vigencia, mensagem=mensagem, criado_por=usuario,
            ))
    if vigencia <= cobranca.inicio_do_mes(cobranca.hoje()):
        for r in criados:
            aplicar(r)
    if enviar:
        for r in criados:
            enviar_email(r)
    return criados
