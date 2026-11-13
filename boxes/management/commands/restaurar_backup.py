r"""
Volta o sistema para um backup. APAGA os dados atuais e carrega os do backup.

    .venv\Scripts\python manage.py restaurar_backup backups\newbox-backup-2026-11-13-080000.zip --confirmar

Antes de restaurar, faz um backup do estado atual (para poder voltar atrás).
"""

from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from boxes import backup


class Command(BaseCommand):
    help = "Restaura um backup (apaga os dados atuais)."

    def add_arguments(self, parser):
        parser.add_argument("arquivo")
        parser.add_argument("--confirmar", action="store_true", help="Necessário: confirma que os dados atuais serão substituídos.")

    def handle(self, arquivo, confirmar, **_):
        caminho = Path(arquivo)
        if not caminho.exists():
            raise CommandError(f"Arquivo não encontrado: {caminho}")
        if not confirmar:
            raise CommandError(
                "Isto APAGA os dados atuais e coloca os do backup no lugar. "
                "Se é isso mesmo, rode de novo com --confirmar."
            )
        conteudo = caminho.read_bytes()  # lê antes de fazer o backup de segurança
        seguranca = backup.fazer_backup()
        self.stdout.write(f"Backup do estado atual (por segurança): {seguranca}")
        try:
            backup.restaurar(conteudo)
        except Exception as e:  # noqa: BLE001
            raise CommandError(f"Não foi possível restaurar: {e}. Os dados atuais não foram alterados.")
        self.stdout.write(self.style.SUCCESS(f"Pronto! Sistema restaurado a partir de {caminho.name}."))
