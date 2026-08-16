param(
  [switch]$Install,
  [switch]$Run,
  [string]$EnrollmentCode = '',
  [string]$ApiBase = 'https://api.ekodi.kr',
  [string]$Label = ''
)

$ErrorActionPreference = 'Stop'
$AgentVersion = '1.0.0'
$Root = Join-Path $env:ProgramData 'EKODI\DeviceAgent'
$AgentPath = Join-Path $Root 'ekodi-device-agent.ps1'
$ConfigPath = Join-Path $Root 'config.json'
$PowerBackupPath = Join-Path $Root 'power-before-ekodi.pow'
$TaskName = 'EKODI Device Agent'

function Test-IsAdministrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]::new($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Protect-LocalSecret([string]$Value) {
  $bytes = [Text.Encoding]::UTF8.GetBytes($Value)
  $protected = [Security.Cryptography.ProtectedData]::Protect(
    $bytes,
    $null,
    [Security.Cryptography.DataProtectionScope]::LocalMachine
  )
  return [Convert]::ToBase64String($protected)
}

function Unprotect-LocalSecret([string]$Value) {
  $protected = [Convert]::FromBase64String($Value)
  $bytes = [Security.Cryptography.ProtectedData]::Unprotect(
    $protected,
    $null,
    [Security.Cryptography.DataProtectionScope]::LocalMachine
  )
  return [Text.Encoding]::UTF8.GetString($bytes)
}

function Get-OsVersion {
  try {
    $os = Get-CimInstance Win32_OperatingSystem
    return "$($os.Caption) $($os.Version)"
  } catch {
    return [Environment]::OSVersion.VersionString
  }
}

function Get-ActiveSchemeGuid {
  $output = (& powercfg.exe /getactivescheme 2>&1 | Out-String)
  $match = [regex]::Match($output, '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}')
  if (-not $match.Success) { throw '현재 Windows 전원 계획 GUID를 확인하지 못했습니다.' }
  return $match.Value
}

function Save-PowerBackup {
  if (Test-Path $PowerBackupPath) { return }
  New-Item -ItemType Directory -Path $Root -Force | Out-Null
  $guid = Get-ActiveSchemeGuid
  & powercfg.exe /export $PowerBackupPath $guid | Out-Null
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path $PowerBackupPath)) {
    throw '기존 Windows 전원 계획 백업에 실패했습니다.'
  }
}

function Invoke-PowerCfg([string[]]$Arguments) {
  $output = (& powercfg.exe @Arguments 2>&1 | Out-String).Trim()
  if ($LASTEXITCODE -ne 0) {
    throw "powercfg 실패: $output"
  }
  return $output
}

function Restore-PowerBackup {
  if (-not (Test-Path $PowerBackupPath)) { throw '복원할 EKODI 이전 전원 설정 백업이 없습니다.' }
  $restoredGuid = [guid]::NewGuid().ToString()
  Invoke-PowerCfg @('/import', $PowerBackupPath, $restoredGuid) | Out-Null
  Invoke-PowerCfg @('/setactive', $restoredGuid) | Out-Null
  return $restoredGuid
}

function Open-AutologonManager {
  $tools = Join-Path $Root 'Sysinternals'
  $zip = Join-Path $Root 'AutoLogon.zip'
  New-Item -ItemType Directory -Path $tools -Force | Out-Null
  if (-not (Test-Path (Join-Path $tools 'Autologon64.exe')) -and -not (Test-Path (Join-Path $tools 'Autologon.exe'))) {
    Invoke-WebRequest -UseBasicParsing 'https://download.sysinternals.com/files/AutoLogon.zip' -OutFile $zip
    Expand-Archive -Path $zip -DestinationPath $tools -Force
  }
  $binary = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') {
    Join-Path $tools 'Autologon64a.exe'
  } elseif ([Environment]::Is64BitOperatingSystem) {
    Join-Path $tools 'Autologon64.exe'
  } else {
    Join-Path $tools 'Autologon.exe'
  }
  if (-not (Test-Path $binary)) { throw 'Microsoft Sysinternals Autologon 실행 파일을 찾을 수 없습니다.' }
  Start-Process -FilePath $binary
  return 'Autologon 창을 로컬에서 열었습니다. 암호는 EKODI 클라우드로 전송되지 않습니다.'
}

function Get-AgentSettings {
  $scheme = ''
  try { $scheme = Get-ActiveSchemeGuid } catch { $scheme = 'unknown' }
  return @{
    activePowerScheme = $scheme
    powerBackupAvailable = (Test-Path $PowerBackupPath)
    autologon = 'local-consent-only'
  }
}

function Invoke-DeviceCommand([pscustomobject]$Command) {
  $type = [string]$Command.type
  switch ($type) {
    'power.always_on' {
      Save-PowerBackup
      Invoke-PowerCfg @('/change', 'standby-timeout-ac', '0') | Out-Null
      Invoke-PowerCfg @('/change', 'standby-timeout-dc', '0') | Out-Null
      Invoke-PowerCfg @('/change', 'hibernate-timeout-ac', '0') | Out-Null
      Invoke-PowerCfg @('/change', 'hibernate-timeout-dc', '0') | Out-Null
      Invoke-PowerCfg @('/change', 'monitor-timeout-ac', '30') | Out-Null
      Invoke-PowerCfg @('/change', 'monitor-timeout-dc', '15') | Out-Null
      return @{ message = '항상 켜짐 프로필을 적용했습니다.'; settings = Get-AgentSettings }
    }
    'power.presentation' {
      Save-PowerBackup
      Invoke-PowerCfg @('/change', 'standby-timeout-ac', '0') | Out-Null
      Invoke-PowerCfg @('/change', 'standby-timeout-dc', '0') | Out-Null
      Invoke-PowerCfg @('/change', 'hibernate-timeout-ac', '0') | Out-Null
      Invoke-PowerCfg @('/change', 'hibernate-timeout-dc', '0') | Out-Null
      Invoke-PowerCfg @('/change', 'monitor-timeout-ac', '0') | Out-Null
      Invoke-PowerCfg @('/change', 'monitor-timeout-dc', '0') | Out-Null
      return @{ message = '프레젠테이션 프로필을 적용했습니다.'; settings = Get-AgentSettings }
    }
    'power.normal' {
      Save-PowerBackup
      Invoke-PowerCfg @('/change', 'monitor-timeout-ac', '15') | Out-Null
      Invoke-PowerCfg @('/change', 'monitor-timeout-dc', '5') | Out-Null
      Invoke-PowerCfg @('/change', 'standby-timeout-ac', '30') | Out-Null
      Invoke-PowerCfg @('/change', 'standby-timeout-dc', '15') | Out-Null
      Invoke-PowerCfg @('/change', 'hibernate-timeout-ac', '0') | Out-Null
      Invoke-PowerCfg @('/change', 'hibernate-timeout-dc', '180') | Out-Null
      return @{ message = '일반 전원 프로필을 적용했습니다.'; settings = Get-AgentSettings }
    }
    'power.restore' {
      $guid = Restore-PowerBackup
      return @{ message = 'EKODI 적용 전 전원 계획으로 복원했습니다.'; restoredScheme = $guid; settings = Get-AgentSettings }
    }
    'lock.resume_off' {
      Save-PowerBackup
      Invoke-PowerCfg @('/SETACVALUEINDEX', 'SCHEME_CURRENT', 'SUB_NONE', 'CONSOLELOCK', '0') | Out-Null
      Invoke-PowerCfg @('/SETDCVALUEINDEX', 'SCHEME_CURRENT', 'SUB_NONE', 'CONSOLELOCK', '0') | Out-Null
      Invoke-PowerCfg @('/SETACTIVE', 'SCHEME_CURRENT') | Out-Null
      return @{ message = '절전 복귀 시 로그인 요구를 해제했습니다.'; settings = Get-AgentSettings }
    }
    'lock.resume_on' {
      Save-PowerBackup
      Invoke-PowerCfg @('/SETACVALUEINDEX', 'SCHEME_CURRENT', 'SUB_NONE', 'CONSOLELOCK', '1') | Out-Null
      Invoke-PowerCfg @('/SETDCVALUEINDEX', 'SCHEME_CURRENT', 'SUB_NONE', 'CONSOLELOCK', '1') | Out-Null
      Invoke-PowerCfg @('/SETACTIVE', 'SCHEME_CURRENT') | Out-Null
      return @{ message = '절전 복귀 시 로그인을 다시 요구하도록 설정했습니다.'; settings = Get-AgentSettings }
    }
    'autologon.open' {
      return @{ message = Open-AutologonManager; settings = Get-AgentSettings }
    }
    default {
      throw "허용되지 않은 명령입니다: $type"
    }
  }
}

function Load-Config {
  if (-not (Test-Path $ConfigPath)) { throw 'EKODI Device Agent 설정 파일이 없습니다. 다시 등록해 주세요.' }
  return Get-Content $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
}

function Get-AgentHeaders($Config) {
  return @{
    Authorization = "Bearer $(Unprotect-LocalSecret $Config.protectedToken)"
    'X-EKODI-Device-ID' = [string]$Config.deviceId
  }
}

function Send-Heartbeat($Config) {
  $body = @{
    hostname = $env:COMPUTERNAME
    osVersion = Get-OsVersion
    agentVersion = $AgentVersion
    capabilities = @{
      powerProfiles = $true
      resumeLock = $true
      restore = $true
      autologonLocalConsent = $true
      arbitraryShell = $false
    }
    settings = Get-AgentSettings
  } | ConvertTo-Json -Depth 8
  Invoke-RestMethod -Method Post -Uri "$($Config.apiBase)/api/device-agent/heartbeat" -Headers (Get-AgentHeaders $Config) -ContentType 'application/json' -Body $body | Out-Null
}

function Complete-Command($Config, [string]$CommandId, [bool]$Success, $Result) {
  $body = @{
    success = $Success
    result = $Result
  } | ConvertTo-Json -Depth 10
  Invoke-RestMethod -Method Post -Uri "$($Config.apiBase)/api/device-agent/commands/$CommandId/result" -Headers (Get-AgentHeaders $Config) -ContentType 'application/json' -Body $body | Out-Null
}

function Poll-Command($Config) {
  $response = Invoke-RestMethod -Method Get -Uri "$($Config.apiBase)/api/device-agent/commands/next" -Headers (Get-AgentHeaders $Config)
  if (-not $response.command) { return }
  try {
    $result = Invoke-DeviceCommand $response.command
    Complete-Command $Config ([string]$response.command.id) $true $result
  } catch {
    Complete-Command $Config ([string]$response.command.id) $false @{ message = $_.Exception.Message }
  }
}

function Install-Agent {
  if (-not $EnrollmentCode) { throw '-EnrollmentCode가 필요합니다.' }
  if (-not (Test-IsAdministrator)) {
    $arguments = @(
      '-NoProfile', '-ExecutionPolicy', 'Bypass',
      '-File', "`"$PSCommandPath`"",
      '-Install',
      '-EnrollmentCode', "`"$EnrollmentCode`"",
      '-ApiBase', "`"$ApiBase`""
    )
    if ($Label) { $arguments += @('-Label', "`"$Label`"") }
    Start-Process powershell.exe -Verb RunAs -ArgumentList $arguments
    return
  }

  New-Item -ItemType Directory -Path $Root -Force | Out-Null
  Copy-Item -Path $PSCommandPath -Destination $AgentPath -Force
  $enrollmentBody = @{
    enrollmentCode = $EnrollmentCode
    platform = 'windows'
    hostname = $env:COMPUTERNAME
    label = $(if ($Label) { $Label } else { $env:COMPUTERNAME })
    osVersion = Get-OsVersion
    agentVersion = $AgentVersion
    capabilities = @{
      powerProfiles = $true
      resumeLock = $true
      restore = $true
      autologonLocalConsent = $true
      arbitraryShell = $false
    }
  } | ConvertTo-Json -Depth 8

  $enrollment = Invoke-RestMethod -Method Post -Uri "$($ApiBase.TrimEnd('/'))/api/device-agent/enroll" -ContentType 'application/json' -Body $enrollmentBody
  $config = @{
    deviceId = [string]$enrollment.deviceId
    apiBase = $ApiBase.TrimEnd('/')
    protectedToken = Protect-LocalSecret ([string]$enrollment.deviceToken)
    installedAt = (Get-Date).ToUniversalTime().ToString('o')
  }
  $config | ConvertTo-Json | Set-Content -Path $ConfigPath -Encoding UTF8

  $userId = [Security.Principal.WindowsIdentity]::GetCurrent().Name
  $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$AgentPath`" -Run"
  $trigger = New-ScheduledTaskTrigger -AtLogOn -User $userId
  $principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Highest
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null

  Start-Process powershell.exe -WindowStyle Hidden -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',"`"$AgentPath`"",'-Run')
  Write-Host "EKODI Device Agent 등록 완료: $($enrollment.deviceId)" -ForegroundColor Green
}

function Run-Agent {
  $mutex = [Threading.Mutex]::new($false, 'Global\EKODI_Device_Agent_V1')
  if (-not $mutex.WaitOne(0, $false)) { return }
  try {
    $config = Load-Config
    $lastHeartbeat = [datetime]::MinValue
    while ($true) {
      try {
        if (((Get-Date) - $lastHeartbeat).TotalSeconds -ge 60) {
          Send-Heartbeat $config
          $lastHeartbeat = Get-Date
        }
        Poll-Command $config
      } catch {
        # 네트워크 중단은 다음 주기에 자동 복구합니다. 임의 명령 실행으로 우회하지 않습니다.
      }
      Start-Sleep -Seconds 10
    }
  } finally {
    try { $mutex.ReleaseMutex() } catch {}
    $mutex.Dispose()
  }
}

if ($Install) {
  Install-Agent
  exit
}
if ($Run) {
  Run-Agent
  exit
}

Write-Host 'EKODI Device Agent' -ForegroundColor Cyan
Write-Host '등록: -Install -EnrollmentCode <코드> [-ApiBase https://api.ekodi.kr]'
Write-Host '실행: -Run'
