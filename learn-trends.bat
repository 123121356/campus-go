@echo off
chcp 65001 >nul
cd /d "%~dp0"
rem 요즘 화제 학습: 커뮤니티·검색 트렌드를 모아 AI가 NPC 대사로 정리 → data\trends.json
rem   learn-trends.bat            지금 한 번 실행
rem   learn-trends.bat schedule   작업 스케줄러에 6시간마다 등록
where node >nul 2>nul || (echo Node.js 가 없습니다. setup.bat 을 먼저 실행하세요. & pause & exit /b 1)
if /i "%~1"=="schedule" (
  schtasks /create /f /tn "CampusGO 요즘 화제 학습" /sc hourly /mo 6 /tr "\"%~f0\"" >nul && echo 6시간마다 자동 실행으로 등록했어요. 끄기: schtasks /delete /tn "CampusGO 요즘 화제 학습" /f
  pause & exit /b 0
)
if not exist logs mkdir logs
echo [%date% %time%] 화제 학습 시작 >> logs\trends.log
node tools\learn-trends.mjs %* >> logs\trends.log 2>&1
if errorlevel 1 echo 일부 실패 - logs\trends.log 를 확인하세요
if exist ".git" (
  git add data\trends.json >> logs\trends.log 2>&1
  git diff --cached --quiet || (
    git commit -m "요즘 화제 학습: %date%" >> logs\trends.log 2>&1
    git pull --rebase origin main >> logs\trends.log 2>&1
    git push origin main >> logs\trends.log 2>&1
  )
)
powershell -NoProfile -Command "Get-Content -Encoding UTF8 logs\trends.log -Tail 12"
