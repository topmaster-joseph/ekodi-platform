@echo off
setlocal
rem EKODI-LOCAL-SITE-VAULT-001: local Windows user only. Never suppress PowerShell security policy.
set "SCRIPT=%~dp0ekodi-site-vault.ps1"
if not exist "%SCRIPT%" (
  echo EKODI Site Vault is not installed on this PC.
  exit /b 2
)
powershell.exe -NoProfile -File "%SCRIPT%" -Action manage
exit /b %ERRORLEVEL%
