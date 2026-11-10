"""
Inicia o servidor (Django) e o site (React) juntos, numa única janela.

    py rodar.py        (Windows)
    python3 rodar.py   (Mac/Linux)

Para desligar os dois: Ctrl+C.
Pré-requisito: já ter feito a instalação (iniciar.bat / iniciar.sh) uma vez.
"""

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
