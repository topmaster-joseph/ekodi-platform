@echo off
setlocal
title EKODI POS Agent - Stop
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "$stopped=$false; $task=Get-ScheduledTask -TaskName 'EKODI POS Agent' -ErrorAction SilentlyContinue; if($task){Stop-ScheduledTask -TaskName 'EKODI POS Agent' -ErrorAction SilentlyContinue; $stopped=$true}; Get-CimInstance Win32_Process -Filter ""Name='powershell.exe'"" -ErrorAction SilentlyContinue | Where-Object {$_.CommandLine -and $_.CommandLine -like '*EKODI-POS-Agent.ps1*'} | ForEach-Object {try{Invoke-CimMethod -InputObject $_ -MethodName Terminate -ErrorAction Stop | Out-Null; $stopped=$true}catch{}}; if(-not $stopped){Write-Host 'EKODI POS Agent is not currently running.' -ForegroundColor Yellow}; Write-Host 'EKODI POS Agent stopped. Automatic start at the next Windows logon remains enabled.' -ForegroundColor Green"
set code=%ERRORLEVEL%
echo.
if not "%code%"=="0" echo If access is denied, right-click this file and choose "Run as administrator".
pause
exit /b %code%
