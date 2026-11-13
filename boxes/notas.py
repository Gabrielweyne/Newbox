"""Envio da nota fiscal da mensalidade por e-mail ao cliente."""

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from django.utils import timezone

MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto",
         "setembro", "outubro", "novembro", "dezembro"]


def enviar_nota_fiscal(mensalidade):
    """Envia o PDF da nota ao e-mail do cliente e registra o envio. Levanta exceção se falhar."""
    cliente = mensalidade.cliente
    box = mensalidade.box
    mes = f"{MESES[mensalidade.competencia.month - 1]} de {mensalidade.competencia.year}"
    contexto = {
        "nome": cliente.nome.split()[0],
        "mes": mes,
        "box": box.pk,
        "tamanho": box.tamanho,
        "unidade": box.sede.nome_publico or box.sede.nome,
        "valor": f"R$ {mensalidade.valor:,.2f}".replace(",", "X").replace(".", ",").replace("X", "."),
        "numero": mensalidade.nota_numero,
    }
    assunto = f"Newbox - Nota fiscal de {mes}" + (f" (nº {mensalidade.nota_numero})" if mensalidade.nota_numero else "")
    email = EmailMultiAlternatives(
        subject=assunto,
        body=render_to_string("emails/nota_fiscal.txt", contexto),
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[cliente.email],
    )
    email.attach_alternative(render_to_string("emails/nota_fiscal.html", contexto), "text/html")
    mensalidade.nota_fiscal.open("rb")
    try:
        nome = f"nota-fiscal-newbox-{mensalidade.competencia:%Y-%m}-box{box.pk}.pdf"
        email.attach(nome, mensalidade.nota_fiscal.read(), "application/pdf")
    finally:
        mensalidade.nota_fiscal.close()
    email.send()
    mensalidade.nota_enviada_em = timezone.now()
    mensalidade.nota_enviada_para = cliente.email
    mensalidade.save(update_fields=["nota_enviada_em", "nota_enviada_para"])
