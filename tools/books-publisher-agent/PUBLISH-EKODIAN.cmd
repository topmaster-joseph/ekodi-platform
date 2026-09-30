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
echo.
echo [EKODI] This run may click the final Google Play Books Publish button for:
echo         에코디언을 찾아서
echo.
set /p CONFIRM=Type PUBLISH to continue: 
if /I not "%CONFIRM%"=="PUBLISH" (
  echo Cancelled.
  pause
  exit /b 0
)
call npm start -- --manifest ".\examples\ekodian.json" --publish --approve-title "에코디언을 찾아서"
if errorlevel 1 (
  echo.
  echo [EKODI] The run was blocked. Review the message above and the local audit log.
)
pause
