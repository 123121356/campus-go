@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo   캠퍼스GO 개발 환경 설치
echo ============================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
  echo [1/3] Node.js 가 없습니다. 설치합니다...
  winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
  set NEED_RESTART=1
) else (
  for /f "delims=" %%v in ('node -v') do echo [1/3] Node.js 설치됨: %%v
)

where git >nul 2>nul
if %errorlevel% neq 0 (
  echo [2/3] Git 이 없습니다. 설치합니다...
  winget install -e --id Git.Git --accept-package-agreements --accept-source-agreements
  set NEED_RESTART=1
) else (
  for /f "delims=" %%v in ('git --version') do echo [2/3] Git 설치됨: %%v
)

if not exist ".env" (
  copy ".env.example" ".env" >nul
  echo [3/3] .env 파일을 만들었습니다. 메모장으로 열어 API 키를 붙여 넣으세요.
) else (
  echo [3/3] .env 파일이 이미 있습니다.
)

echo.
if defined NEED_RESTART (
  echo 새로 설치한 프로그램이 있습니다. 이 창을 닫고 setup.bat 을 한 번 더 실행해 확인하세요.
) else (
  echo 설치 완료! start.bat 을 더블클릭하면 http://localhost:3000 에서 앱이 열립니다.
)
echo.
pause
