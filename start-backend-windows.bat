@echo off
setlocal
cd /d "%~dp0backend"
echo SheRise backend: http://localhost:4000
npm run dev
