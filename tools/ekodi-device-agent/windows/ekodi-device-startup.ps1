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
  if (Test-IsPortable) { throw '노트북은 EKODI 자동 작업 및 원격 Wake 대상에서 제외됩니다.' }
  try {
    $adapters = @(Get-NetAdapter -Physical -ErrorAction Stop | Where-Object {
      $_.HardwareInterface -and $_.InterfaceDescription -notmatch '(?i)wireless|wi-fi|wifi|bluetooth'
    })
    foreach ($adapter in $adapters) {
      try { Set-NetAdapterPowerManagement -Name $adapter.Name -WakeOnMagicPacket Enabled -ErrorAction Stop | Out-Null } catch {}
      try { & powercfg.exe -deviceenablewake $adapter.InterfaceDescription 2>$null | Out-Null } catch {}
    }
  } catch {}
}

function Install-BootTask {
  if (-not (Test-IsAdministrator)) { throw '관리자 권한으로 실행해야 합니다.' }
  if (Test-IsPortable) { throw '노트북은 EKODI 자동 작업 및 원격 Wake 대상에서 제외됩니다.' }
  New-Item -ItemType Directory -Path $Root -Force | Out-Null
  $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$AgentPath`" -Run"
  $trigger = New-ScheduledTaskTrigger -AtStartup
  $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
  Enable-EthernetWake
  if ($RunNow -and (Test-Path $AgentPath) -and (Test-Path $ConfigPath)) {
    Start-ScheduledTask -TaskName $TaskName
  }
  Write-Host 'EKODI 부팅 자동복귀 설정이 완료되었습니다.' -ForegroundColor Green
}

if ($Install) { Install-BootTask; exit 0 }
Write-Host '사용법: -Install [-RunNow]'
