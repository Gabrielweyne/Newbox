"""
Backup completo do sistema: todos os dados do banco + arquivos enviados
(comprovantes, notas fiscais), num único .zip.

- Funciona com SQLite e com PostgreSQL (os dados vão em JSON, o formato do Django).
- Guarda os últimos NEWBOX_BACKUP_MANTER (padrão 30) na pasta NEWBOX_BACKUP_PASTA
  (padrão: backups/ dentro do projeto).
- Se NEWBOX_BACKUP_COPIA estiver no .env (ex.: a pasta do Google Drive no computador),
  cada backup também é copiado para lá: assim existe uma cópia fora deste computador.
"""

import io
import re
import shutil
import zipfile
from datetime import datetime, timedelta
from pathlib import Path

from django.conf import settings
from django.core.management import call_command
from django.utils import timezone

# Não entram: tabelas que o próprio Django recria e os tokens de login (expiram sozinhos)
EXCLUIR = ["contenttypes", "auth.permission", "admin.logentry", "sessions", "token_blacklist"]
NOME = re.compile(r"^newbox-backup-\d{4}-\d{2}-\d{2}-\d{6}\.zip$")


def pasta():
    p = Path(settings.NEWBOX_BACKUP_PASTA)
    p.mkdir(parents=True, exist_ok=True)
    return p


def listar():
    arquivos = sorted((a for a in pasta().iterdir() if NOME.match(a.name)), reverse=True)
    return [
        {"nome": a.name, "tamanho": a.stat().st_size,
         "criado_em": timezone.make_aware(datetime.fromtimestamp(a.stat().st_mtime))}
        for a in arquivos
    ]


def feito_hoje():
    hoje = timezone.localdate().strftime("%Y-%m-%d")
    return any(b["nome"].startswith(f"newbox-backup-{hoje}") for b in listar())


def gerar_zip(destino):
    """Escreve o backup em `destino` (caminho ou arquivo aberto)."""
    dados = io.StringIO()
    call_command("dumpdata", natural_foreign=True, natural_primary=True, exclude=EXCLUIR,
                 indent=1, stdout=dados)
    media = Path(settings.MEDIA_ROOT)
    with zipfile.ZipFile(destino, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("dados.json", dados.getvalue())
        z.writestr("LEIA-ME.txt", (
            f"Backup do sistema Newbox - {timezone.localtime():%d/%m/%Y %H:%M}\n\n"
            "Para restaurar (apaga os dados atuais e volta para os deste backup):\n"
            "  .venv\\Scripts\\python manage.py restaurar_backup CAMINHO_DESTE_ARQUIVO.zip --confirmar\n"
        ))
        if media.exists():
            for arquivo in media.rglob("*"):
                if arquivo.is_file():
                    z.write(arquivo, f"media/{arquivo.relative_to(media).as_posix()}")


def fazer_backup():
    """Cria um backup novo, apaga os mais antigos e copia para a pasta extra. Devolve o caminho."""
    agora = timezone.localtime()
    nome = f"newbox-backup-{agora:%Y-%m-%d-%H%M%S}.zip"
    caminho = pasta() / nome
    while caminho.exists():  # nunca sobrescreve um backup existente
        agora += timedelta(seconds=1)
        nome = f"newbox-backup-{agora:%Y-%m-%d-%H%M%S}.zip"
        caminho = pasta() / nome
    temporario = caminho.with_suffix(".parcial")
    gerar_zip(temporario)
    temporario.replace(caminho)

    for antigo in listar()[settings.NEWBOX_BACKUP_MANTER:]:
        (pasta() / antigo["nome"]).unlink(missing_ok=True)

    copia = settings.NEWBOX_BACKUP_COPIA
    if copia:
        destino = Path(copia)
        destino.mkdir(parents=True, exist_ok=True)
        shutil.copy2(caminho, destino / nome)
        for antigo in sorted((a for a in destino.iterdir() if NOME.match(a.name)), reverse=True)[
            settings.NEWBOX_BACKUP_MANTER:
        ]:
            antigo.unlink(missing_ok=True)
    return caminho


def restaurar(conteudo):
    """
    Apaga tudo do banco e carrega o backup (`conteudo` = bytes do .zip, lidos antes
    de qualquer outro backup ser feito). Os arquivos (media) são repostos.
    """
    from django.db import transaction

    with zipfile.ZipFile(io.BytesIO(conteudo)) as z:
        if "dados.json" not in z.namelist():
            raise ValueError("Este arquivo não é um backup do Newbox (falta o dados.json).")
        temporario = Path(settings.NEWBOX_BACKUP_PASTA) / "restaurando-dados.json"
        temporario.write_bytes(z.read("dados.json"))
        try:
            with transaction.atomic():
                call_command("flush", interactive=False, allow_cascade=True, verbosity=0)
                call_command("loaddata", str(temporario), verbosity=0)
        finally:
            temporario.unlink(missing_ok=True)
        media = Path(settings.MEDIA_ROOT)
        for nome in z.namelist():
            if nome.startswith("media/") and not nome.endswith("/"):
                alvo = (media / nome[len("media/"):]).resolve()
                if media.resolve() in alvo.parents:  # nunca escreve fora da pasta media
                    alvo.parent.mkdir(parents=True, exist_ok=True)
                    alvo.write_bytes(z.read(nome))
