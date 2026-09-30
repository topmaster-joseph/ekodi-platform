@echo off
setlocal
title EKODI POS Agent - Stop
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "$t=Get-ScheduledTask -TaskName 'EKODI POS Agent' -ErrorAction SilentlyContinue; if(-not $t){ Write-Host 'EKODI POS Agent scheduled task was not found.' -ForegroundColor Yellow; exit 2 }; Stop-ScheduledTask -TaskName 'EKODI POS Agent' -ErrorAction Stop; Start-Sleep -Milliseconds 500; Write-Host 'EKODI POS Agent stopped. Automatic start at the next Windows logon remains enabled.' -ForegroundColor Green"
set code=%ERRORLEVEL%
echo.
if not "%code%"=="0" echo If access is denied, right-click this file and choose "Run as administrator".
pause
exit /b %code%
