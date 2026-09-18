param(
  [switch]$Install,
  [switch]$RunNow
)

$ErrorActionPreference = 'Stop'
$Root = Join-Path $env:ProgramData 'EKODI\DeviceAgent'
$AgentPath = Join-Path $Root 'ekodi-device-agent.ps1'
$ConfigPath = Join-Path $Root 'config.json'
$TaskName = 'EKODI Device Agent Boot'

function Test-IsAdministrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]::new($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Test-IsPortable {
  try {
    $battery = @(Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue)
    $computer = Get-CimInstance Win32_ComputerSystem -ErrorAction SilentlyContinue
    $enclosure = @(Get-CimInstance Win32_SystemEnclosure -ErrorAction SilentlyContinue | Select-Object -First 1)
    $portableTypes = @(8,9,10,14,30,31,32)
    $chassis = @($(if ($enclosure.Count) { $enclosure[0].ChassisTypes } else { @() }) | ForEach-Object { [int]$_ })
    return ($battery.Count -gt 0) -or ([int]$computer.PCSystemType -eq 2) -or (@($chassis | Where-Object { $portableTypes -contains $_ }).Count -gt 0)
  } catch { return $false }
}

function Enable-EthernetWake {
  if (Test-IsPortable) { throw '[EKODI:EKBW-420][wol] 노트북은 EKODI 자동 작업 및 원격 Wake 대상에서 제외됩니다.' }
  $errors = @()
  try {
    $adapters = @(Get-NetAdapter -Physical -ErrorAction Stop | Where-Object {
      $_.HardwareInterface -and $_.InterfaceDescription -notmatch '(?i)wireless|wi-fi|wifi|bluetooth'
    })
    foreach ($adapter in $adapters) {
      try { Set-NetAdapterPowerManagement -Name $adapter.Name -WakeOnMagicPacket Enabled -ErrorAction Stop | Out-Null } catch { $errors += "$($adapter.Name):Set-NetAdapterPowerManagement:$($_.Exception.Message)" }
      try {
        & powercfg.exe -deviceenablewake $adapter.InterfaceDescription 2>$null | Out-Null
        if ($LASTEXITCODE -ne 0) { $errors += "$($adapter.Name):powercfg:$LASTEXITCODE" }
      } catch { $errors += "$($adapter.Name):powercfg:$($_.Exception.Message)" }
    }
    return @{ adapters = $adapters.Count; errors = $errors }
  } catch {
    throw "[EKODI:EKBW-421][wol] Ethernet Wake 장치 조회에 실패했습니다. :: $($_.Exception.Message)"
  }
}

function Install-BootTask {
  if (-not (Test-IsAdministrator)) { throw '[EKODI:EKBW-400][authorization] 관리자 권한으로 실행해야 합니다.' }
  if (Test-IsPortable) { throw '[EKODI:EKBW-401][device_class] 노트북은 EKODI 자동 작업 및 원격 Wake 대상에서 제외됩니다.' }
  try {
    New-Item -ItemType Directory -Path $Root -Force | Out-Null
    $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$AgentPath`" -Run"
    $trigger = New-ScheduledTaskTrigger -AtStartup
    $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
  } catch {
    throw "[EKODI:EKBW-410][boot_task] 부팅 자동복귀 Scheduled Task 등록에 실패했습니다. :: $($_.Exception.Message)"
  }
  $wake = Enable-EthernetWake
  if ($wake.errors.Count -gt 0) {
    Write-Warning "[EKODI:EKBW-422][wol_partial] WOL 일부 설정을 적용하지 못했습니다: $($wake.errors -join ' | ')"
  }
  if ($RunNow -and (Test-Path $AgentPath) -and (Test-Path $ConfigPath)) {
    try { Start-ScheduledTask -TaskName $TaskName } catch {
      throw "[EKODI:EKBW-430][run_now] 부팅 Agent 즉시 실행에 실패했습니다. :: $($_.Exception.Message)"
    }
  }
  Write-Host '[EKODI:EKBW-000][complete] 데스크톱 부팅 자동복귀/WOL 설정이 완료되었습니다.' -ForegroundColor Green
}

if ($Install) {
  try { Install-BootTask; exit 0 } catch { Write-Error $_.Exception.Message; exit 1 }
}
Write-Host '사용법: -Install [-RunNow]'
