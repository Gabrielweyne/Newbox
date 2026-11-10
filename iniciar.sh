#!/usr/bin/env bash
# Newbox - prepara e inicia o sistema para teste local (Mac/Linux).
set -e
cd "$(dirname "$0")"

command -v python3 >/dev/null || { echo "Instale o Python 3.12: https://www.python.org/downloads/"; exit 1; }
command -v npm >/dev/null || { echo "Instale o Node.js (LTS): https://nodejs.org"; exit 1; }

[ -f .env ] || cp .env.example .env
[ -x .venv/bin/python ] || { echo "[1/5] Criando ambiente Python..."; python3 -m venv .venv; }
echo "[2/5] Instalando dependências do Python..."
.venv/bin/python -m pip install --disable-pip-version-check -q -r requirements.txt
echo "[3/5] Preparando o banco de dados..."
.venv/bin/python manage.py migrate -v 0
.venv/bin/python manage.py dados_exemplo 2>/dev/null || true
echo "[4/5] Instalando dependências do site..."
(cd frontend && npm install --no-fund --no-audit --loglevel=error)

echo "[5/5] Iniciando..."
.venv/bin/python manage.py runserver 8000 &
DJANGO_PID=$!
trap 'kill $DJANGO_PID 2>/dev/null' EXIT

cat <<'TXT'

Abra http://localhost:3000 no navegador.
Para entrar (senha de todos: Newbox#2026):
  Administrador ........ CPF 111.444.777-35
  Ana Lima (Cocó) ...... CPF 529.982.247-25
  Bruno Melo (Cambeba) . CPF 390.533.447-05
Para desligar, aperte Ctrl+C.

TXT
(command -v open >/dev/null && sleep 4 && open http://localhost:3000) >/dev/null 2>&1 &
cd frontend && npm run dev
