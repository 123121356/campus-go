@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo   캠퍼스GO GitHub 업로드
echo ============================================
echo.
where git >nul 2>nul || (echo Git 이 없습니다. setup.bat 을 먼저 실행하세요. & pause & exit /b 1)

for /f "delims=" %%v in ('git config --global user.name 2^>nul') do set GUSER=%%v
if not defined GUSER (
  set /p GNAME=GitHub 에 표시할 이름: 
  set /p GMAIL=GitHub 계정 이메일: 
  call git config --global user.name "%%GNAME%%"
  call git config --global user.email "%%GMAIL%%"
)

if not exist ".git" (
  git init
  git branch -M main
)

git add .
git diff --cached --name-only | findstr /r /c:"^\.env$" >nul && (
  echo [중단] .env 파일이 올라가려고 합니다. API 키가 새어 나갈 수 있어 멈춥니다.
  git reset -q .env
  pause & exit /b 1
)
git commit -m "캠퍼스GO 업데이트" || echo (새로 커밋할 변경 없음)

git remote get-url origin >nul 2>nul
if errorlevel 1 (
  echo.
  echo github.com 에서 빈 저장소를 먼저 만드세요 ^(README 추가 체크 해제^).
  set /p REPO=저장소 주소 ^(예: https://github.com/아이디/campus-go.git^): 
  call git remote add origin %%REPO%%
)

echo.
echo 업로드 중... 처음이면 GitHub 로그인 창이 뜹니다.
git push -u origin main
echo.
if errorlevel 1 (echo 업로드 실패. 위 메시지를 캡처해 주세요.) else (echo 완료! GitHub 저장소 페이지를 새로고침해 보세요.)
pause
