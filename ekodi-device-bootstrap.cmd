@echo off
setlocal
chcp 65001 >nul
title EKODI Device 연결 프로그램 설치

echo EKODI Device 연결 프로그램을 준비합니다.
echo 기존 EKODI Agent가 있으면 기기 등록은 유지한 채 최신 버전으로 전환합니다.
echo Windows 관리자 승인 창이 표시될 수 있습니다.
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $p=Join-Path $env:TEMP 'ekodi-device-agent-bootstrap.ps1'; Invoke-WebRequest -UseBasicParsing 'https://raw.githubusercontent.com/topmaster-joseph/ekodi-platform/main/tools/ekodi-device-agent/windows/ekodi-device-agent.ps1' -OutFile $p; $text=Get-Content $p -Raw; if($text -notmatch 'EKODI Device Agent'){throw 'Agent 식별 검증에 실패했습니다.'}; $tokens=$null; $errors=$null; $ast=[System.Management.Automation.Language.Parser]::ParseInput($text,[ref]$tokens,[ref]$errors); if($errors.Count -gt 0){throw 'Agent 구문 검증에 실패했습니다.'}; $names=@($ast.FindAll({param($n) $n -is [System.Management.Automation.Language.CommandAst]},$true)|ForEach-Object{$_.GetCommandName()}|Where-Object{$_}); foreach($bad in @(('Invoke-'+'Expression'),('i'+'ex'))){if($names -contains $bad){throw '허용되지 않은 실행 명령이 포함되어 있습니다.'}}; Start-Process powershell.exe -Verb RunAs -Wait -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+$p+'"'),'-RegisterProtocol')"

if errorlevel 1 (
  echo.
  echo 설치 또는 업그레이드에 실패했습니다. 관리자 사이트의 고급 설치 명령을 사용해 주세요.
  pause
  exit /b 1
)

echo.
echo 연결 프로그램 설치 또는 Agent 업그레이드가 완료되었습니다.
echo 관리자 사이트로 돌아가 [이 PC 연결 계속]을 누르세요.
pause
endlocal
