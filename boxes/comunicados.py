"""Comunicados em massa: quem recebe e o envio dos e-mails."""

import logging

from django.conf import settings
from django.core.mail import EmailMultiAlternatives, get_connection
from django.db.models import Q
from django.template.loader import render_to_string

from .models import Cliente, Comunicado, EnvioComunicado

logger = logging.getLogger(__name__)


def destinatarios(publico, sede_id=None):
    """
    ativos: clientes com box alugado (na sede, se informada).
    todos: todos os clientes; com sede, os que já tiveram box/contrato lá.
    """
    qs = Cliente.objects.all()
    if publico == Comunicado.ATIVOS:
        filtro = Q(boxes__isnull=False)
        if sede_id:
            filtro = Q(boxes__sede_id=sede_id)
        qs = qs.filter(filtro)
    elif sede_id:
        qs = qs.filter(Q(boxes__sede_id=sede_id) | Q(contratos__box__sede_id=sede_id))
    return qs.distinct().order_by("nome")


def resumo_destinatarios(publico, sede_id=None):
    clientes = list(destinatarios(publico, sede_id).values_list("email", "telefone"))
    return {
        "total": len(clientes),
        "com_email": sum(1 for e, _ in clientes if e),
        "com_whatsapp": sum(1 for _, t in clientes if t),
    }


def disparar(comunicado):
    """Cria um envio por cliente, manda os e-mails e deixa o WhatsApp pendente."""
    envios = []
    for c in destinatarios(comunicado.publico, comunicado.sede_id):
        envios.append(EnvioComunicado(
            comunicado=comunicado, cliente=c, email=c.email, telefone=c.telefone,
            email_situacao=(EnvioComunicado.PENDENTE if c.email else EnvioComunicado.SEM_CONTATO)
            if comunicado.por_email else EnvioComunicado.NAO_SE_APLICA,
            whatsapp_situacao=(EnvioComunicado.PENDENTE if c.telefone else EnvioComunicado.SEM_CONTATO)
            if comunicado.por_whatsapp else EnvioComunicado.NAO_SE_APLICA,
        ))
    EnvioComunicado.objects.bulk_create(envios)
    if comunicado.por_email:
        enviar_emails(comunicado)


def enviar_emails(comunicado):
    pendentes = comunicado.envios.filter(email_situacao__in=[EnvioComunicado.PENDENTE, EnvioComunicado.FALHOU])
    pendentes = list(pendentes.select_related("cliente"))
    if not pendentes:
        return
    unidade = comunicado.sede.nome_publico if comunicado.sede and comunicado.sede.nome_publico else "Newbox"
    try:
        conexao = get_connection()
        conexao.open()
    except Exception:
        logger.exception("Não foi possível conectar ao servidor de e-mail")
        EnvioComunicado.objects.filter(pk__in=[e.pk for e in pendentes]).update(email_situacao=EnvioComunicado.FALHOU)
        return
    try:
        for envio in pendentes:
            texto = comunicado.texto_para(envio.cliente)
            contexto = {"titulo": comunicado.titulo, "texto": texto, "unidade": unidade}
            email = EmailMultiAlternatives(
                subject=f"Newbox - {comunicado.titulo}",
                body=render_to_string("emails/comunicado.txt", contexto),
                from_email=settings.DEFAULT_FROM_EMAIL,
                to=[envio.email],
                connection=conexao,
            )
            email.attach_alternative(render_to_string("emails/comunicado.html", contexto), "text/html")
            try:
                email.send()
                envio.email_situacao = EnvioComunicado.ENVIADO
            except Exception:
                logger.exception("Falha ao enviar comunicado para %s", envio.email)
                envio.email_situacao = EnvioComunicado.FALHOU
            envio.save(update_fields=["email_situacao"])
    finally:
        conexao.close()
