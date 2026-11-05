@echo off
chcp 65001 >nul
cd /d "%~dp0"
rem 강원대 홈페이지를 읽고 AI가 정리해 data\knowledge.json 에 쌓습니다.
rem 작업 스케줄러가 매일 이 파일을 실행합니다. 더블클릭으로 바로 실행해도 됩니다.
where node >nul 2>nul || (echo Node.js 가 없습니다. setup.bat 을 먼저 실행하세요. & exit /b 1)
if not exist logs mkdir logs
echo [%date% %time%] 학습 시작 >> logs\learn.log
node tools\learn-school.mjs %* >> logs\learn.log 2>&1
if errorlevel 1 (echo 학습 실패 - logs\learn.log 를 확인하세요 & powershell -NoProfile -Command "Get-Content -Encoding UTF8 logs\learn.log -Tail 15" & exit /b 1)

rem GitHub Actions 매일 학습 설정 파일을 제자리에 둠 (처음 한 번)
if not exist ".github\workflows\daily-learn.yml" (mkdir ".github\workflows" 2>nul & copy /y tools\daily-learn.yml ".github\workflows\daily-learn.yml" >nul)

rem GitHub 에 연결돼 있으면 결과를 올려 Vercel 배포본도 갱신
if exist ".git" (
  git add data\knowledge.json data\school.json data\learn-log.json >> logs\learn.log 2>&1
  git diff --cached --quiet || (
    git commit -m "매일 학습: %date% 학교 공지 업데이트" >> logs\learn.log 2>&1
    git pull --rebase origin main >> logs\learn.log 2>&1
    git push origin main >> logs\learn.log 2>&1
  )
)
echo 완료! 결과는 logs\learn.log 와 data\learn-log.json 에 있습니다.
powershell -NoProfile -Command "Get-Content -Encoding UTF8 logs\learn.log -Tail 15"
