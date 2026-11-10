@echo off
chcp 65001 >nul
title Newbox - Instalação
cd /d "%~dp0"

echo ==================================================
echo   Newbox - preparando o sistema para teste local
echo ==================================================
echo.

where python >nul 2>nul
if errorlevel 1 (
  echo [ERRO] Python não encontrado.
  echo Instale o Python 3.12 em https://www.python.org/downloads/
  echo e MARQUE a opção "Add python.exe to PATH" na instalação.
  pause
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo [ERRO] Node.js não encontrado.
  echo Instale a versão LTS em https://nodejs.org
  pause
  exit /b 1
)

if not exist ".env" (
  echo Criando o arquivo .env a partir do modelo...
  copy ".env.example" ".env" >nul
)

if not exist ".venv\Scripts\python.exe" (
  echo [1/5] Criando ambiente Python...
  python -m venv .venv || goto erro
)
echo [2/5] Instalando dependências do Python...
".venv\Scripts\python.exe" -m pip install --disable-pip-version-check -q -r requirements.txt || goto erro

echo [3/5] Preparando o banco de dados...
".venv\Scripts\python.exe" manage.py migrate -v 0 || goto erro
".venv\Scripts\python.exe" manage.py dados_exemplo 2>nul

echo [4/5] Instalando dependências do site (pode demorar na 1a vez)...
pushd frontend
call npm install --no-fund --no-audit --loglevel=error || (popd & goto erro)
popd

echo [5/5] Iniciando...
start "Newbox - Servidor (Django)" cmd /k ".venv\Scripts\python.exe manage.py runserver 8000"
start "Newbox - Site (React)" cmd /k "cd frontend && npm run dev"

echo.
echo Aguarde alguns segundos: o navegador vai abrir em http://localhost:3000
echo.
echo Para entrar (senha de todos: Newbox#2026):
echo   Administrador ........ CPF 111.444.777-35
echo   Ana Lima (Cocó) ...... CPF 529.982.247-25
echo   Bruno Melo (Cambeba) . CPF 390.533.447-05
echo.
echo Para desligar, feche as duas janelas pretas que abriram.
timeout /t 6 >nul
start "" http://localhost:3000
pause
exit /b 0

:erro
echo.
echo [ERRO] Algo deu errado acima. Copie a mensagem e mande para o Claude.
pause
exit /b 1
