@echo off
setlocal
title EKODI POS Agent - Start
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "$task=Get-ScheduledTask -TaskName 'EKODI POS Agent' -ErrorAction SilentlyContinue; $agent=Join-Path $env:ProgramData 'EKODI\POSAgent\EKODI-POS-Agent.ps1'; $config=Join-Path $env:ProgramData 'EKODI\POSAgent\pos-agent.config.json'; if($task){Start-ScheduledTask -TaskName 'EKODI POS Agent'} elseif((Test-Path -LiteralPath $agent) -and (Test-Path -LiteralPath $config)){Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-WindowStyle','Hidden','-ExecutionPolicy','Bypass','-File',$agent,'-ConfigPath',$config) -WindowStyle Hidden} else {Write-Host 'EKODI POS Agent is not installed. Run the one-click setup first.' -ForegroundColor Yellow; exit 2}; Start-Sleep -Milliseconds 900; try{$r=Invoke-RestMethod -Uri 'http://127.0.0.1:17831/v1/health' -Method Get -TimeoutSec 2; if($r.ok){Write-Host 'EKODI POS Agent started.' -ForegroundColor Green; exit 0}}catch{}; Write-Host 'Start requested. Open the EKODI POS screen and press Agent status check.' -ForegroundColor Yellow"
set code=%ERRORLEVEL%
echo.
if not "%code%"=="0" echo If access is denied, right-click this file and choose "Run as administrator".
pause
exit /b %code%
