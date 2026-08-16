@echo off
setlocal
chcp 65001 >nul
title EKODI Device 연결 프로그램 설치

echo EKODI Device 연결 프로그램을 준비합니다.
echo Windows 관리자 승인 창이 표시될 수 있습니다.
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $p=Join-Path $env:TEMP 'ekodi-device-agent-bootstrap.ps1'; Invoke-WebRequest -UseBasicParsing 'https://raw.githubusercontent.com/topmaster-joseph/ekodi-platform/main/tools/ekodi-device-agent/windows/ekodi-device-agent.ps1' -OutFile $p; $text=Get-Content $p -Raw; if($text -match '(?i)Invoke-Expression|\biex\b' -or $text -notmatch 'EKODI Device Agent'){throw 'Agent 검증에 실패했습니다.'}; Start-Process powershell.exe -Verb RunAs -Wait -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+$p+'"'),'-RegisterProtocol')"

if errorlevel 1 (
  echo.
  echo 설치에 실패했습니다. 관리자 사이트의 고급 설치 명령을 사용해 주세요.
  pause
  exit /b 1
)

echo.
echo 설치가 완료되었습니다.
echo 관리자 사이트로 돌아가 [이 PC 연결 계속]을 누르세요.
pause
endlocal
