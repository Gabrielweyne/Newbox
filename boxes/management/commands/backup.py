r"""
Faz um backup completo (dados + comprovantes) em backups/.

    .venv\Scripts\python manage.py backup               (sempre faz)
    .venv\Scripts\python manage.py backup --se-precisar (só se ainda não tem backup de hoje)

O rodar.py chama com --se-precisar toda vez que o sistema é aberto. No servidor,
agende para rodar todo dia (cron / Agendador de Tarefas).
"""

from django.core.management.base import BaseCommand

from boxes import backup


class Command(BaseCommand):
    help = "Faz um backup completo do sistema (dados + comprovantes)."

    def add_arguments(self, parser):
        parser.add_argument("--se-precisar", action="store_true", help="Só faz se ainda não houver backup de hoje.")

    def handle(self, se_precisar, **_):
        if se_precisar and backup.feito_hoje():
            self.stdout.write("Backup de hoje já existe.")
            return
        caminho = backup.fazer_backup()
        self.stdout.write(self.style.SUCCESS(f"Backup salvo: {caminho}"))
