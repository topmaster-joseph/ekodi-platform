@echo off
setlocal
chcp 65001 >nul
title EKODI Device 연결 프로그램 설치

echo EKODI Device Agent 연결 프로그램을 설치하거나 안전하게 업그레이드합니다.
echo 새 Agent를 먼저 검증하고, 기존 Agent가 있으면 실패 시 자동 롤백합니다.
echo 데스크톱 전용 부팅 자동복귀/WOL 설정은 Agent 설치와 분리되어 별도로 적용합니다.
echo Windows 관리자 승인이 필요한 경우 한 번만 표시됩니다.
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $stage='download'; try { $agent=Join-Path $env:TEMP 'ekodi-device-agent-bootstrap.ps1'; Invoke-WebRequest -UseBasicParsing 'https://raw.githubusercontent.com/topmaster-joseph/ekodi-platform/main/tools/ekodi-device-agent/windows/ekodi-device-agent.ps1' -OutFile $agent; $stage='validate'; $text=Get-Content $agent -Raw -Encoding UTF8; if($text -notmatch '\$AgentVersion\s*='){throw '[EKB-110][validate] EKODI Agent 식별 검증에 실패했습니다.'}; $tokens=$null; $errors=$null; $ast=[System.Management.Automation.Language.Parser]::ParseInput($text,[ref]$tokens,[ref]$errors); if($errors.Count -gt 0){throw '[EKB-111][validate] PowerShell 구문 검증에 실패했습니다.'}; $names=@($ast.FindAll({param($n) $n -is [System.Management.Automation.Language.CommandAst]},$true)|ForEach-Object{$_.GetCommandName()}|Where-Object{$_}); foreach($bad in @(('Invoke-'+'Expression'),('i'+'ex'))){if($names -contains $bad){throw '[EKB-112][validate] 허용되지 않은 실행 명령이 포함되어 있습니다.'}}; $stage='install'; $identity=[Security.Principal.WindowsIdentity]::GetCurrent(); $principal=[Security.Principal.WindowsPrincipal]::new($identity); $isAdmin=$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator); $args=@('-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+$agent+'"'),'-RegisterProtocol'); if($isAdmin){ & powershell.exe @args; $exitCode=$LASTEXITCODE } else { $p=Start-Process powershell.exe -Verb RunAs -Wait -PassThru -ArgumentList $args; $exitCode=$p.ExitCode }; if($exitCode -ne 0){throw ('[EKB-130][install] Device Agent 설치·업그레이드가 종료 코드 '+$exitCode+'로 실패했습니다.')}; Write-Host '[EKB-000][complete] Device Agent 연결 프로그램 설치·업그레이드 완료.' -ForegroundColor Green } catch { Write-Error ('[EKB-199]['+$stage+'] '+$_.Exception.Message); exit 1 }"

if errorlevel 1 (
  echo.
  echo EKODI Device Agent 설치 또는 업그레이드에 실패했습니다.
  echo 위 오류의 EKB/EKA 코드와 단계가 실제 실패 지점입니다. 기존 Agent가 있었다면 자동 롤백을 시도했습니다.
  echo 부팅 자동복귀/WOL 설정은 이번 작업에서 변경하지 않았습니다.
  pause
  exit /b 1
)

echo.
echo Device Agent 연결 프로그램이 준비되었습니다.
echo 관리자 사이트로 돌아가 [이 PC 연결 계속]을 누르세요.
echo 부팅 자동복귀/WOL은 실행 인프라의 별도 데스크톱 설정에서 적용하세요.
pause
endlocal
