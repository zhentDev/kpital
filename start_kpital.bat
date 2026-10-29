@echo off
echo Iniciando Servidores de Titanes...

:: Ir al directorio donde esta guardado este archivo .bat
cd /d "%~dp0"

echo Levantando Backend (FastAPI con uv)...
start "Titanes - Backend" cmd /k "cd /d "%~dp0backend" && uv run uvicorn main:app --reload --port 8000"

echo Esperando 3 segundos...
timeout /t 3 /nobreak >nul

echo Levantando Frontend (Vite/React con Bun)...
start "Titanes - Frontend" cmd /k "cd /d "%~dp0frontend" && bun run dev"

echo Listo! Puedes minimizar esta ventana.

