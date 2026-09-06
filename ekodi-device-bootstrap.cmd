@echo off
setlocal
chcp 65001 >nul
title EKODI Device 연결 프로그램 설치

echo EKODI Device 연결 프로그램과 부팅 자동복귀를 준비합니다.
echo 기존 EKODI Agent가 있으면 기기 등록은 유지한 채 최신 버전으로 전환합니다.
echo 데스크톱만 자동 작업 및 원격 Wake 대상으로 구성합니다.
echo Windows 관리자 승인 창이 표시될 수 있습니다.
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $agent=Join-Path $env:TEMP 'ekodi-device-agent-bootstrap.ps1'; $boot=Join-Path $env:TEMP 'ekodi-device-startup-bootstrap.ps1'; Invoke-WebRequest -UseBasicParsing 'https://raw.githubusercontent.com/topmaster-joseph/ekodi-platform/main/tools/ekodi-device-agent/windows/ekodi-device-agent.ps1' -OutFile $agent; Invoke-WebRequest -UseBasicParsing 'https://raw.githubusercontent.com/topmaster-joseph/ekodi-platform/main/tools/ekodi-device-agent/windows/ekodi-device-startup.ps1' -OutFile $boot; foreach($p in @($agent,$boot)){ $text=Get-Content $p -Raw; if($text -notmatch 'EKODI'){throw 'EKODI 파일 식별 검증에 실패했습니다.'}; $tokens=$null; $errors=$null; $ast=[System.Management.Automation.Language.Parser]::ParseInput($text,[ref]$tokens,[ref]$errors); if($errors.Count -gt 0){throw 'PowerShell 구문 검증에 실패했습니다.'}; $names=@($ast.FindAll({param($n) $n -is [System.Management.Automation.Language.CommandAst]},$true)|ForEach-Object{$_.GetCommandName()}|Where-Object{$_}); foreach($bad in @(('Invoke-'+'Expression'),('i'+'ex'))){if($names -contains $bad){throw '허용되지 않은 실행 명령이 포함되어 있습니다.'}} }; $agentInstall=Start-Process powershell.exe -Verb RunAs -Wait -PassThru -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+$agent+'"'),'-RegisterProtocol'); if($agentInstall.ExitCode -ne 0){throw 'Device Agent 설치에 실패했습니다.'}; $bootInstall=Start-Process powershell.exe -Verb RunAs -Wait -PassThru -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+$boot+'"'),'-Install','-RunNow'); if($bootInstall.ExitCode -ne 0){throw '부팅 자동복귀 설치에 실패했습니다.'}"

if errorlevel 1 (
  echo.
  echo 설치 또는 업그레이드에 실패했습니다. 이 PC가 데스크톱인지 확인해 주세요.
  pause
  exit /b 1
)

echo.
echo 연결 프로그램과 부팅 자동복귀 설정이 완료되었습니다.
echo 관리자 사이트로 돌아가 [이 PC 연결 계속]을 누르세요.
pause
endlocal
