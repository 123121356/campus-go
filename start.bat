@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if %errorlevel% neq 0 (
  echo Node.js 가 없습니다. 먼저 setup.bat 을 실행하세요.
  pause
  exit /b 1
)
echo 캠퍼스GO 로컬 서버를 시작합니다. 끝내려면 이 창을 닫거나 Ctrl+C 를 누르세요.
start "" http://localhost:3000
node dev-server.js
pause
