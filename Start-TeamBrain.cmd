@echo off
cd /d "%~dp0"
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":7340 .*LISTENING"') do taskkill /PID %%P /F >nul 2>&1
node --version >nul 2>&1
if errorlevel 1 (
  echo Node.js 22.18 veya daha yeni bir surum gerekli.
  echo https://nodejs.org adresinden kurup tekrar acin.
  pause
  exit /b 1
)
node -e "const [major,minor]=process.versions.node.split('.').map(Number);process.exit(major>22||(major===22&&minor>=18)?0:1)"
if errorlevel 1 (
  echo TeamBrain icin Node.js 22.18 veya daha yeni bir surum gerekli.
  echo https://nodejs.org adresinden guncelleyip tekrar acin.
  pause
  exit /b 1
)
echo TeamBrain http://127.0.0.1:7340 adresinde aciliyor.
echo Bu pencereyi kapatmak sunucuyu durdurur.
if defined TEAMBRAIN_MEMORY_ROOT (
  set "MEMORY_ROOT=%TEAMBRAIN_MEMORY_ROOT%"
) else if exist "C:\TeamBrain-memory\.git" (
  set "MEMORY_ROOT=C:\TeamBrain-memory"
) else (
  set "MEMORY_ROOT=%~dp0data"
)
echo Memory: %MEMORY_ROOT%
node --no-warnings --experimental-sqlite bin\teambrain.js dashboard --root "%MEMORY_ROOT%" --port 7340 --open
pause
