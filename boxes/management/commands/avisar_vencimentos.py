"""
Envia por e-mail, aos funcionários de cada sede, o resumo das mensalidades
que vencem hoje (quem pagou e quem não pagou) e das que estão atrasadas.

Só envia nos dias de vencimento (5, 10, 15, 20, 25, 30 e, em meses curtos,
o último dia). Deve rodar uma vez por dia, por exemplo pelo cron:

    0 8 * * *  cd /caminho/Newbox && .venv/bin/python manage.py avisar_vencimentos

Opções:
    --data AAAA-MM-DD   simula outro dia (para testar)
    --forcar            envia mesmo que hoje não seja dia de vencimento
"""

from datetime import date

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import send_mail
from django.core.management.base import BaseCommand
from django.template.loader import render_to_string

from boxes import cobranca
from boxes.models import Mensalidade, Sede

User = get_user_model()


class Command(BaseCommand):
    help = "Envia e-mail de vencimentos do dia para os funcionários de cada sede."

    def add_arguments(self, parser):
        parser.add_argument("--data", type=date.fromisoformat)
        parser.add_argument("--forcar", action="store_true")

    def handle(self, *args, data=None, forcar=False, **opts):
        dia = data or cobranca.hoje()
        if not cobranca.dias_de_vencimento_hoje(dia) and not forcar:
            self.stdout.write(f"{dia:%d/%m/%Y} não é dia de vencimento. Nada enviado.")
            return

        cobranca.garantir_mensalidades(ate=dia)
        base = Mensalidade.objects.select_related("box", "cliente").order_by("box_id")
        resumo_geral = []
        enviados = 0

        for sede in Sede.objects.order_by("nome"):
            da_sede = base.filter(box__sede=sede)
            vencem = list(da_sede.filter(vencimento=dia))
            atrasadas = list(da_sede.filter(pago_em__isnull=True, vencimento__lt=dia).order_by("vencimento"))
            if not vencem and not atrasadas:
                continue
            contexto = {
                "sede": sede,
                "dia": dia,
                "pagas": [m for m in vencem if m.pago_em],
                "nao_pagas": [m for m in vencem if not m.pago_em],
                "atrasadas": atrasadas,
                "link": f"{settings.FRONTEND_URL.rstrip('/')}/mensalidades",
            }
            resumo_geral.append(contexto)
            destinatarios = list(
                User.objects.filter(funcionario__sede=sede, is_active=True)
                .exclude(email="")
                .values_list("email", flat=True)
            )
            enviados += self._enviar(destinatarios, [contexto], dia)

        if resumo_geral:
            admins = list(
                User.objects.filter(is_staff=True, is_active=True).exclude(email="").values_list("email", flat=True)
            )
            enviados += self._enviar(admins, resumo_geral, dia)

        self.stdout.write(self.style.SUCCESS(f"{dia:%d/%m/%Y}: {enviados} e-mail(s) enviado(s)."))

    def _enviar(self, destinatarios, sedes, dia):
        if not destinatarios:
            return 0
        contexto = {"sedes": sedes, "dia": dia, "link": sedes[0]["link"]}
        pendentes = sum(len(s["nao_pagas"]) + len(s["atrasadas"]) for s in sedes)
        assunto = f"Newbox - Vencimentos de {dia:%d/%m}"
        if pendentes:
            assunto += f" ({pendentes} pendente{'s' if pendentes > 1 else ''})"
        send_mail(
            subject=assunto,
            message=render_to_string("emails/vencimentos.txt", contexto),
            html_message=render_to_string("emails/vencimentos.html", contexto),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=destinatarios,
        )
        return len(destinatarios)
