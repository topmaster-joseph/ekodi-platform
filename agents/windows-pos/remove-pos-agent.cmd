@echo off
setlocal EnableExtensions
title EKODI POS Agent - Remove

if /I "%~1" NEQ "elevated" (
  net session >nul 2>&1
  if errorlevel 1 (
    echo Requesting administrator permission...
    powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%ComSpec%' -ArgumentList '/c ""%~f0" elevated"' -Verb RunAs"
    exit /b
  )
)

echo.
echo [EKODI] This will remove the EKODI POS Agent scheduled task and installed files.
choice /C YN /N /M "Continue? [Y/N]: "
if errorlevel 2 exit /b 0

set "EKODI_POS_REMOVE_DIR=%TEMP%\EKODI-POS-Agent-Remove"
if exist "%EKODI_POS_REMOVE_DIR%" rmdir /s /q "%EKODI_POS_REMOVE_DIR%"
mkdir "%EKODI_POS_REMOVE_DIR%" >nul 2>&1

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Stop';" ^
  "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12;" ^
  "$uri='https://raw.githubusercontent.com/topmaster-joseph/ekodi-platform/main/agents/windows-pos/uninstall-pos-agent.ps1';" ^
  "$out=Join-Path $env:EKODI_POS_REMOVE_DIR 'uninstall-pos-agent.ps1';" ^
  "Invoke-WebRequest -UseBasicParsing -Uri $uri -OutFile $out -TimeoutSec 30;" ^
  "$script=Get-Content -LiteralPath $out -Raw -Encoding UTF8;" ^
  "if($script -notmatch 'EKODI POS Agent removed'){throw 'Downloaded removal script validation failed.'};" ^
  "& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $out;" ^
  "if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}"

set "code=%ERRORLEVEL%"
echo.
if "%code%"=="0" (
  echo [EKODI] POS Agent removal completed.
) else (
  echo [EKODI] Removal failed with exit code %code%.
)
echo.
pause
exit /b %code%
