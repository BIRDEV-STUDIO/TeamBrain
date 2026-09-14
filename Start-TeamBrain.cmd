@echo off
cd /d "%~dp0"
node --version >nul 2>&1
if errorlevel 1 (
  echo Node.js 22.18 veya daha yeni bir surum gerekli.
  echo https://nodejs.org adresinden kurup tekrar acin.
  pause
  exit /b 1
)
echo TeamBrain http://127.0.0.1:7340 adresinde aciliyor.
echo Bu pencereyi kapatmak sunucuyu durdurur.
start "" "http://127.0.0.1:7340"
node --experimental-sqlite bin\teambrain.js dashboard --root data --port 7340
pause
