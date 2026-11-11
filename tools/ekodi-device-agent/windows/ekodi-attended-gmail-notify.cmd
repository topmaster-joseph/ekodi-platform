@echo off
rem EKODI attended operator browser (Constitution v1.27.9 1D-1). Double-click on the operator PC.
chcp 65001 >nul
where node >nul 2>nul || (echo Node.js 22 이상이 필요합니다: https://nodejs.org & pause & exit /b 1)
node "%~dp0ekodi-attended-browser.mjs" --recipe gmail-operator-notify
pause
