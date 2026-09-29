@echo off
setlocal EnableExtensions
title EKODI POS Agent - One Click Setup

if /I "%~1" NEQ "elevated" (
  net session >nul 2>&1
  if errorlevel 1 (
    echo Requesting administrator permission...
    powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%ComSpec%' -ArgumentList '/c ""%~f0" elevated"' -Verb RunAs"
    exit /b
  )
)

set "EKODI_POS_SETUP_DIR=%TEMP%\EKODI-POS-Agent-Setup"
if exist "%EKODI_POS_SETUP_DIR%" rmdir /s /q "%EKODI_POS_SETUP_DIR%"
mkdir "%EKODI_POS_SETUP_DIR%" >nul 2>&1

echo.
echo [EKODI] Downloading the official POS Agent package...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Stop';" ^
  "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12;" ^
  "$base='https://raw.githubusercontent.com/topmaster-joseph/ekodi-platform/main/agents/windows-pos';" ^
  "$dir=$env:EKODI_POS_SETUP_DIR;" ^
  "$files=@('install-pos-agent.ps1','EKODI-POS-Agent.ps1','pos-agent.config.example.json','diagnose-pos-targets.ps1','start-pos-agent.cmd','stop-pos-agent.cmd','uninstall-pos-agent.ps1');" ^
  "foreach($name in $files){$uri=$base+'/'+$name;$out=Join-Path $dir $name;Invoke-WebRequest -UseBasicParsing -Uri $uri -OutFile $out -TimeoutSec 30};" ^
  "$installer=Get-Content -LiteralPath (Join-Path $dir 'install-pos-agent.ps1') -Raw -Encoding UTF8;" ^
  "$agent=Get-Content -LiteralPath (Join-Path $dir 'EKODI-POS-Agent.ps1') -Raw -Encoding UTF8;" ^
  "if($installer -notmatch 'listenerPrefix must remain loopback-only' -or $agent -notmatch 'explicit_user_action_only'){throw 'Downloaded package validation failed.'};" ^
  "& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $dir 'install-pos-agent.ps1');" ^
  "if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}"

set "code=%ERRORLEVEL%"
echo.
if "%code%"=="0" (
  echo [EKODI] POS Agent installation completed.
  echo Open the store POS admin page and press "Agent status check".
) else (
  echo [EKODI] Setup failed with exit code %code%.
  echo Keep this window open and capture the error message if support is needed.
)
echo.
pause
exit /b %code%
