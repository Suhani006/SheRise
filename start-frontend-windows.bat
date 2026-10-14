@echo off
setlocal
cd /d "%~dp0frontend"
echo SheRise frontend: http://localhost:5173
npm run dev -- --host 0.0.0.0
