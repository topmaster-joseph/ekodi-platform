@echo off
rem setup-pos-agent-compat.cmd - EKODI legacy POS compatibility setup
setlocal EnableExtensions
title EKODI POS Agent - Compatibility Setup
set "EKODI_POS_SETUP_COMPAT=task-scheduler-startup-fallback-v6"

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
echo [EKODI] Compatibility setup: Windows Task Scheduler will be bypassed.
echo [EKODI] The Agent will start from the current user's Windows Startup folder.
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Stop';" ^
  "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12;" ^
  "$base='https://ekodi.kr/cmpmyi/admin/agent/download';" ^
  "$dir=$env:EKODI_POS_SETUP_DIR;" ^
  "$nonce=[DateTime]::UtcNow.Ticks;" ^
  "$files=@('install-pos-agent.ps1','EKODI-POS-Agent.ps1','pos-agent.config.example.json','diagnose-pos-targets.ps1','start-pos-agent.cmd','stop-pos-agent.cmd','uninstall-pos-agent.ps1');" ^
  "foreach($name in $files){$uri=$base+'/'+$name+'?v='+$nonce;$out=Join-Path $dir $name;Invoke-WebRequest -UseBasicParsing -Uri $uri -OutFile $out -TimeoutSec 30};" ^
  "$installerPath=Join-Path $dir 'install-pos-agent.ps1';" ^
  "$installer=Get-Content -LiteralPath $installerPath -Raw -Encoding UTF8;" ^
  "if($installer -notmatch 'EKODI_POS_INSTALLER_COMPAT=task-scheduler-0x80041318-v6' -or $installer -notmatch '\[switch\]\$ForceStartupFallback'){throw 'The compatibility installer is not yet available from the EKODI download gateway. Please download this file again in a moment.'};" ^
  "$tokens=$null;$parseErrors=$null;[void][System.Management.Automation.Language.Parser]::ParseFile($installerPath,[ref]$tokens,[ref]$parseErrors);if($parseErrors.Count -gt 0){throw ('Downloaded installer syntax check failed: '+$parseErrors[0].Message)};" ^
  "$agent=Get-Content -LiteralPath (Join-Path $dir 'EKODI-POS-Agent.ps1') -Raw -Encoding UTF8;" ^
  "if($installer -notmatch 'listenerPrefix must remain loopback-only' -or $agent -notmatch 'explicit_user_action_only'){throw 'Downloaded package validation failed.'};" ^
  "& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installerPath -ForceStartupFallback;" ^
  "if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}"

set "code=%ERRORLEVEL%"
echo.
if "%code%"=="0" (
  echo [EKODI] POS Agent compatibility installation completed.
  echo [EKODI] Task Scheduler was not used.
  echo Open the store POS admin page and press "Agent status check".
) else (
  echo [EKODI] Compatibility setup failed with exit code %code%.
  echo Keep this window open and capture the error message if support is needed.
)
echo.
pause
exit /b %code%
