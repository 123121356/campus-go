@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo   캠퍼스GO 매일 학습 예약 (윈도우 작업 스케줄러)
echo ============================================
echo  매일 아침 07:00 에 learn-now.bat 을 자동 실행합니다.
echo  (컴퓨터가 꺼져 있었으면 다음에 켤 때 바로 실행)
echo.
schtasks /create /f /tn "CampusGO 매일 학습" /sc daily /st 07:00 /tr "\"%~dp0learn-now.bat\"" >nul
if errorlevel 1 (echo 예약 실패. 이 파일을 마우스 오른쪽 - 관리자 권한으로 실행해 보세요. & pause & exit /b 1)
powershell -NoProfile -Command "$t=Get-ScheduledTask -TaskName 'CampusGO 매일 학습'; $t.Settings.StartWhenAvailable=$true; $t.Settings.DisallowStartIfOnBatteries=$false; Set-ScheduledTask -InputObject $t | Out-Null" 2>nul
echo 예약 완료!  확인: 작업 스케줄러 ^> "CampusGO 매일 학습"
echo 예약 해제: schtasks /delete /tn "CampusGO 매일 학습" /f
echo.
set /p RUN=지금 한 번 바로 학습할까요? 처음이면 과거 글 10쪽까지 읽습니다 (Y/N):
if /i "%RUN%"=="Y" call learn-now.bat --pages=10
pause
