@echo off
setlocal EnableExtensions
title EKODI POS Agent - Central status enrollment

if /I "%~1" NEQ "elevated" (
  net session >nul 2>&1
  if errorlevel 1 (
    echo Requesting administrator permission...
    powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%ComSpec%' -ArgumentList '/c ""%~f0" elevated"' -Verb RunAs"
    exit /b
  )
)

echo.
echo [EKODI] Optional: register this POS PC so EKODI central admin can see its Agent status.
echo [EKODI] Only status is reported. No remote commands are accepted. Window titles stay on this PC.
echo [EKODI] Issue a one-time code in EKODI Device management with device type POS first.
echo.
set "EKODI_POS_ENROLLMENT_CODE="
set /p "EKODI_POS_ENROLLMENT_CODE=Enrollment code (EKD-...): "
if not defined EKODI_POS_ENROLLMENT_CODE (
  echo [EKODI] No code entered. Nothing changed.
  pause
  exit /b 1
)

set "EKODI_POS_ENROLL_DIR=%TEMP%\EKODI-POS-Agent-Enroll"
if exist "%EKODI_POS_ENROLL_DIR%" rmdir /s /q "%EKODI_POS_ENROLL_DIR%"
mkdir "%EKODI_POS_ENROLL_DIR%" >nul 2>&1

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Stop';" ^
  "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12;" ^
  "$uri='https://ekodi.kr/cmpmyi/admin/agent/download/enroll-pos-agent.ps1?v='+[DateTime]::UtcNow.Ticks;" ^
  "$out=Join-Path $env:EKODI_POS_ENROLL_DIR 'enroll-pos-agent.ps1';" ^
  "Invoke-WebRequest -UseBasicParsing -Uri $uri -OutFile $out -TimeoutSec 30;" ^
  "$script=Get-Content -LiteralPath $out -Raw -Encoding UTF8;" ^
  "if($script -notmatch 'never polls or executes remote commands'){throw 'Downloaded enrollment script validation failed.'};" ^
  "$tokens=$null;$errors=$null;[void][System.Management.Automation.Language.Parser]::ParseFile($out,[ref]$tokens,[ref]$errors);if($errors.Count){throw 'Downloaded enrollment script syntax check failed.'};" ^
  "& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $out;" ^
  "if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}"

set "code=%ERRORLEVEL%"
set "EKODI_POS_ENROLLMENT_CODE="
echo.
if "%code%"=="0" (
  echo [EKODI] Central status enrollment completed.
) else (
  echo [EKODI] Enrollment failed with exit code %code%. Nothing was enabled.
)
echo.
pause
exit /b %code%
