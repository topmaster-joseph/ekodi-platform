@echo off
setlocal
title EKODI POS Agent - Start
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "if (-not (Get-ScheduledTask -TaskName 'EKODI POS Agent' -ErrorAction SilentlyContinue)) { Write-Host 'EKODI POS Agent is not installed. Run install-pos-agent.ps1 first.' -ForegroundColor Yellow; exit 2 }; Start-ScheduledTask -TaskName 'EKODI POS Agent'; Start-Sleep -Milliseconds 700; try { $r=Invoke-RestMethod -Uri 'http://127.0.0.1:17831/v1/health' -Method Get -TimeoutSec 2; if($r.ok){ Write-Host 'EKODI POS Agent started.' -ForegroundColor Green; exit 0 } } catch {}; Write-Host 'Start requested. Open the EKODI POS screen and press Agent status check.' -ForegroundColor Yellow"
set code=%ERRORLEVEL%
echo.
if not "%code%"=="0" echo If access is denied, right-click this file and choose "Run as administrator".
pause
exit /b %code%
