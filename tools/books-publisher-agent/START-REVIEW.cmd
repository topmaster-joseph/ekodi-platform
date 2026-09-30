@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 20+ is required. Install Node.js LTS, then run this file again.
  pause
  exit /b 1
)
if not exist node_modules\playwright (
  echo [EKODI] Installing the local browser operator...
  call npm install
  if errorlevel 1 pause & exit /b 1
)
call npm start -- --manifest ".\examples\ekodian.json"
if errorlevel 1 (
  echo.
  echo [EKODI] The run was blocked. Review the message above and the local audit log.
)
pause
