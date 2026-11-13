"""
Inicia o servidor (Django) e o site (React) juntos, numa única janela.

Antes de iniciar, atualiza sozinho o que for preciso depois de receber uma
versão nova: dependências do Python e do site, e o banco de dados.

    py rodar.py        (Windows)
    python3 rodar.py   (Mac/Linux)

Para desligar os dois: Ctrl+C.
Pré-requisito: já ter feito a instalação (iniciar.bat / iniciar.sh) uma vez.
"""

import hashlib
import os
import subprocess
import sys
import threading
import time
import webbrowser
from pathlib import Path

RAIZ = Path(__file__).resolve().parent
WINDOWS = os.name == "nt"
PYTHON = RAIZ / ".venv" / ("Scripts/python.exe" if WINDOWS else "bin/python")

if not PYTHON.exists():
    sys.exit("Ambiente não instalado. Rode primeiro o iniciar.bat (Windows) ou ./iniciar.sh (Mac/Linux).")
if not (RAIZ / "frontend" / "node_modules").exists():
    sys.exit("Site não instalado. Rode primeiro o iniciar.bat (Windows) ou ./iniciar.sh (Mac/Linux).")


def _impressao(arquivo):
    return hashlib.sha256(arquivo.read_bytes()).hexdigest() if arquivo.exists() else ""


def preparar():
    """Instala dependências que mudaram e aplica migrações do banco."""
    marcas = RAIZ / ".venv" / ".newbox-instalado"
    antes = dict(l.split("=", 1) for l in marcas.read_text().splitlines() if "=" in l) if marcas.exists() else {}
    agora = {
        "python": _impressao(RAIZ / "requirements.txt"),
        "site": _impressao(RAIZ / "frontend" / "package-lock.json"),
    }
    if antes.get("python") != agora["python"]:
        print("Atualizando dependências do Python...", flush=True)
        subprocess.run([str(PYTHON), "-m", "pip", "install", "--disable-pip-version-check", "-q",
                        "-r", "requirements.txt"], cwd=RAIZ, check=True)
    if antes.get("site") != agora["site"]:
        print("Atualizando dependências do site...", flush=True)
        subprocess.run(["npm", "install", "--no-fund", "--no-audit", "--loglevel=error"],
                       cwd=RAIZ / "frontend", check=True, shell=WINDOWS)
    print("Conferindo o banco de dados...", flush=True)
    subprocess.run([str(PYTHON), "manage.py", "migrate", "-v", "0"], cwd=RAIZ, check=True)
    # Backup do dia (só o primeiro do dia; se falhar, avisa mas não impede de abrir)
    if subprocess.run([str(PYTHON), "manage.py", "backup", "--se-precisar"], cwd=RAIZ).returncode:
        print("ATENÇÃO: não foi possível fazer o backup de hoje.", flush=True)
    marcas.write_text("\n".join(f"{k}={v}" for k, v in agora.items()))


def repassar(processo, prefixo):
    """Mostra a saída de cada programa com uma etiqueta: [servidor] ou [site]."""
    for linha in processo.stdout:
        print(f"{prefixo} {linha.rstrip()}", flush=True)


def iniciar(comando, pasta, prefixo):
    p = subprocess.Popen(
        comando, cwd=pasta, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True, encoding="utf-8", errors="replace", shell=WINDOWS and comando[0] == "npm",
    )
    threading.Thread(target=repassar, args=(p, prefixo), daemon=True).start()
    return p


try:
    preparar()
except subprocess.CalledProcessError:
    sys.exit("\nNão foi possível preparar o sistema. Copie a mensagem de erro acima e mande para o Claude.")

servidor = iniciar([str(PYTHON), "-u", "manage.py", "runserver", "8000"], RAIZ, "[servidor]")
site = iniciar(["npm", "run", "dev"], RAIZ / "frontend", "[site]    ")

print("\nAbrindo http://localhost:3000  (Ctrl+C para desligar tudo)\n", flush=True)
threading.Timer(5, lambda: webbrowser.open("http://localhost:3000")).start()

try:
    while servidor.poll() is None and site.poll() is None:
        time.sleep(0.5)
    print("\nUm dos programas parou. Veja a mensagem acima.", flush=True)
except KeyboardInterrupt:
    print("\nDesligando...", flush=True)
finally:
    for p in (servidor, site):
        if p.poll() is None:
            if WINDOWS:
                subprocess.run(["taskkill", "/F", "/T", "/PID", str(p.pid)], capture_output=True)
            else:
                p.terminate()
