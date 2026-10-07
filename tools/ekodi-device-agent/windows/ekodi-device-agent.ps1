param(
  [switch]$Install,
  [switch]$Run,
  [switch]$RegisterProtocol,
  [string]$EnrollmentCode = '',
  [string]$ApiBase = 'https://ekodi.kr',
  [string]$Label = '',
  [string]$ProtocolUrl = '',
  [string]$ElevationResultPath = ''
)

$ErrorActionPreference = 'Stop'
$AgentVersion = '2.5.2'
$Root = Join-Path $env:ProgramData 'EKODI\DeviceAgent'
$AgentPath = Join-Path $Root 'ekodi-device-agent.ps1'
$ConfigPath = Join-Path $Root 'config.json'
$PowerBackupPath = Join-Path $Root 'power-before-ekodi.pow'
$StartupBackupPath = Join-Path $Root 'startup-backup.json'
$StartupDisabledDir = Join-Path $Root 'StartupDisabled'
$WorkstationProfilePath = Join-Path $Root 'workstation-profile.json'
$TaskName = 'EKODI Device Agent'
$ProtocolScheme = 'ekodi-device'
$ProtocolKey = 'Registry::HKEY_LOCAL_MACHINE\Software\Classes\ekodi-device'
$AgentSourceUrl = 'https://raw.githubusercontent.com/topmaster-joseph/ekodi-platform/main/tools/ekodi-device-agent/windows/ekodi-device-agent.ps1'
$AllowedApiBase = 'https://ekodi.kr'
$UpgradeRoot = Join-Path $Root 'transactions'
$script:RestartAfterCommand = $false
$BrowserCanaryStatePath = Join-Path $Root 'background-browser-canary.json'
$BrowserCanaryProfileRoot = Join-Path $env:ProgramData 'EKODI\BrowserWorker\CanaryProfile'
$BrowserWorkerProfileRoot = Join-Path $env:ProgramData 'EKODI\BrowserWorker\Tasks'
$BrowserCanaryUrl = 'https://ekodi.kr/'
$IsolatedDesktopCanaryStatePath = Join-Path $Root 'isolated-desktop-canary.json'
$IsolatedDesktopGuestCanaryStatePath = Join-Path $Root 'isolated-desktop-guest-canary.json'
$IsolatedDesktopUiCanaryStatePath = Join-Path $Root 'isolated-desktop-ui-canary.json'
$IsolatedDesktopSessionCanaryStatePath = Join-Path $Root 'isolated-desktop-session-canary.json'
$IsolatedDesktopSessionRoot = Join-Path $env:ProgramData 'EKODI\IsolatedDesktop\Sessions'
$ImagePrintPreviewClsid = '{60fd46de-f830-4894-a628-6fa81bc0190d}'
$ImagePrintPreviewUserKey = 'HKCU:\Software\Classes\SystemFileAssociations\image\shell\print'
$ImagePrintPreviewEffectiveKey = 'Registry::HKEY_CLASSES_ROOT\SystemFileAssociations\image\shell\print'
$ImagePrintPreviewBackupRoot = Join-Path $Root 'image-print-preview'
$ImagePrintPreviewBackupMeta = Join-Path $ImagePrintPreviewBackupRoot 'baseline.json'
$ImagePrintPreviewBackupReg = Join-Path $ImagePrintPreviewBackupRoot 'baseline.reg'
$ImagePrintPreviewPolicyStatePath = Join-Path $ImagePrintPreviewBackupRoot 'policy.json'

function Test-IsAdministrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]::new($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Throw-AgentStageError([string]$Code, [string]$Stage, [string]$Message, $Inner = $null) {
  $detail = if ($Inner) { "$Message :: $($Inner.Exception.Message)" } else { $Message }
  throw "[EKODI:$Code][$Stage] $detail"
}

function Invoke-TestFailure([string]$Stage) {
  if ($env:EKODI_AGENT_TEST_FAIL_STAGE -and $env:EKODI_AGENT_TEST_FAIL_STAGE -eq $Stage) {
    throw "injected_failure:$Stage"
  }
}

function Test-IsSafeElevationResultPath([string]$Path) {
  if (-not $Path) { return $false }
  try {
    $full = [IO.Path]::GetFullPath($Path)
    $temp = [IO.Path]::GetFullPath($env:TEMP)
    if (-not $temp.EndsWith([IO.Path]::DirectorySeparatorChar)) { $temp += [IO.Path]::DirectorySeparatorChar }
    return $full.StartsWith($temp, [StringComparison]::OrdinalIgnoreCase)
  } catch {
    return $false
  }
}

function Write-ElevationFailureRecord([string]$Path, [string]$Message) {
  if (-not (Test-IsSafeElevationResultPath $Path)) { return }
  try {
    @{
      message = $Message
      recordedAt = (Get-Date).ToUniversalTime().ToString('o')
    } | ConvertTo-Json -Compress | Set-Content -LiteralPath $Path -Encoding UTF8
  } catch { }
}

function Read-ElevationFailureRecord([string]$Path) {
  if (-not (Test-IsSafeElevationResultPath $Path) -or -not (Test-Path -LiteralPath $Path)) { return '' }
  try {
    $record = Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json
    return [string]$record.message
  } catch {
    return ''
  }
}

function Invoke-ElevatedSelf([string[]]$Arguments) {
  if (Test-IsAdministrator) { return $null }

  $resultPath = Join-Path $env:TEMP ("ekodi-device-elevation-" + [guid]::NewGuid().ToString('N') + ".json")
  try {
    $childArguments = @(
      '-NoProfile','-ExecutionPolicy','Bypass','-File',("`"$PSCommandPath`"")
    ) + $Arguments + @('-ElevationResultPath', ("`"$resultPath`""))

    $process = Start-Process powershell.exe -Verb RunAs -Wait -PassThru -ArgumentList $childArguments
    if ($process.ExitCode -ne 0) {
      $childMessage = Read-ElevationFailureRecord $resultPath
      if ($childMessage -and $childMessage.StartsWith('[EKODI:')) {
        throw $childMessage
      }
      $detail = "관리자 프로세스가 종료 코드 $($process.ExitCode)로 실패했습니다."
      if ($childMessage) { $detail += " :: $childMessage" }
      Throw-AgentStageError 'EKA-091' 'elevation_child' $detail
    }
    return $process.ExitCode
  } catch {
    if ($_.Exception.Message.StartsWith('[EKODI:')) { throw }
    $nativeCode = $null
    if ($_.Exception.PSObject.Properties.Name -contains 'NativeErrorCode') { $nativeCode = $_.Exception.NativeErrorCode }
    if ($nativeCode -eq 1223) {
      Throw-AgentStageError 'EKA-092' 'elevation' 'Windows 관리자 권한 승인이 취소되었습니다.' $_
    }
    Throw-AgentStageError 'EKA-090' 'elevation' 'Windows 관리자 권한 승격 자체에 실패했습니다.' $_
  } finally {
    Remove-Item -LiteralPath $resultPath -Force -ErrorAction SilentlyContinue
  }
}
function Protect-LocalSecret([string]$Value) {
  $bytes = [Text.Encoding]::UTF8.GetBytes($Value)
  $protected = [Security.Cryptography.ProtectedData]::Protect($bytes, $null, [Security.Cryptography.DataProtectionScope]::LocalMachine)
  return [Convert]::ToBase64String($protected)
}

function Unprotect-LocalSecret([string]$Value) {
  $protected = [Convert]::FromBase64String($Value)
  $bytes = [Security.Cryptography.ProtectedData]::Unprotect($protected, $null, [Security.Cryptography.DataProtectionScope]::LocalMachine)
  return [Text.Encoding]::UTF8.GetString($bytes)
}

function Get-Sha256String([string]$Value) {
  $sha = [Security.Cryptography.SHA256]::Create()
  try {
    $bytes = [Text.Encoding]::UTF8.GetBytes($Value)
    return ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant()
  } finally {
    $sha.Dispose()
  }
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
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path $PowerBackupPath)) { throw '기존 Windows 전원 계획 백업에 실패했습니다.' }
}

function Invoke-PowerCfg([string[]]$Arguments) {
  $output = (& powercfg.exe @Arguments 2>&1 | Out-String).Trim()
  if ($LASTEXITCODE -ne 0) { throw "powercfg 실패: $output" }
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

function Get-SystemSnapshot {
  try {
    $os = Get-CimInstance Win32_OperatingSystem
    $processors = @(Get-CimInstance Win32_Processor)
    $cpuValues = @($processors | Where-Object { $_.LoadPercentage -ne $null } | ForEach-Object { [double]$_.LoadPercentage })
    $cpu = if ($cpuValues.Count) { [math]::Round(($cpuValues | Measure-Object -Average).Average, 1) } else { $null }
    $totalKb = [double]$os.TotalVisibleMemorySize
    $freeKb = [double]$os.FreePhysicalMemory
    $usedPct = if ($totalKb -gt 0) { [math]::Round((($totalKb - $freeKb) / $totalKb) * 100, 1) } else { $null }
    $uptime = (Get-Date) - $os.LastBootUpTime
    $battery = @(Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue | Select-Object -First 1)
    $computer = Get-CimInstance Win32_ComputerSystem -ErrorAction SilentlyContinue
    $enclosure = @(Get-CimInstance Win32_SystemEnclosure -ErrorAction SilentlyContinue | Select-Object -First 1)
    $portableChassisTypes = @(8, 9, 10, 14, 30, 31, 32)
    $chassisTypes = @($(if ($enclosure.Count) { $enclosure[0].ChassisTypes } else { @() }) | ForEach-Object { [int]$_ })
    $isPortable = ([int]$computer.PCSystemType -eq 2) -or ($battery.Count -gt 0) -or (@($chassisTypes | Where-Object { $portableChassisTypes -contains $_ }).Count -gt 0)
    return @{
      cpuLoadPct = $cpu
      memoryUsedPct = $usedPct
      memoryTotalGB = [math]::Round($totalKb / 1MB, 1)
      uptimeHours = [math]::Round($uptime.TotalHours, 1)
      batteryPct = $(if ($battery.Count) { [int]$battery[0].EstimatedChargeRemaining } else { $null })
      batteryStatus = $(if ($battery.Count) { [string]$battery[0].BatteryStatus } else { 'not-present' })
      deviceClass = $(if ($isPortable) { 'portable' } else { 'desktop' })
      isPortable = [bool]$isPortable
      autoExecutionEligible = (-not $isPortable)
    }
  } catch {
    return @{ error = 'system_snapshot_unavailable' }
  }
}

function Get-StorageSnapshot {
  try {
    $volumes = @()
    foreach ($disk in @(Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3')) {
      if (-not $disk.Size -or [double]$disk.Size -le 0) { continue }
      $freePct = [math]::Round(([double]$disk.FreeSpace / [double]$disk.Size) * 100, 1)
      $volumes += @{
        drive = [string]$disk.DeviceID
        totalGB = [math]::Round([double]$disk.Size / 1GB, 1)
        freeGB = [math]::Round([double]$disk.FreeSpace / 1GB, 1)
        freePct = $freePct
      }
    }
    return @{ volumes = $volumes; lowSpaceCount = @($volumes | Where-Object { $_.freePct -le 15 }).Count }
  } catch {
    return @{ volumes = @(); lowSpaceCount = 0; error = 'storage_snapshot_unavailable' }
  }
}

function Get-LightHealth {
  return @{ generatedAt = (Get-Date).ToUniversalTime().ToString('o'); system = Get-SystemSnapshot; storage = Get-StorageSnapshot }
}

function Get-NetworkDiagnostic {
  $dnsOk = $false
  $apiReachable = $false
  $connected = 0
  $issues = @()
  try {
    $adapters = @(Get-CimInstance Win32_NetworkAdapter -Filter 'NetEnabled=True')
    $connected = $adapters.Count
  } catch { $issues += 'adapter_query_failed' }
  try {
    $addresses = [Net.Dns]::GetHostAddresses('ekodi.kr')
    $dnsOk = $addresses.Count -gt 0
  } catch { $issues += 'dns_failed' }
  try {
    $apiReachable = [bool](Test-NetConnection -ComputerName 'ekodi.kr' -Port 443 -InformationLevel Quiet -WarningAction SilentlyContinue)
  } catch { $issues += 'api_connection_test_failed' }
  return @{
    checkedAt = (Get-Date).ToUniversalTime().ToString('o')
    connectedAdapters = $connected
    dnsOk = $dnsOk
    apiReachable = $apiReachable
    issues = $issues
  }
}

function Get-PrinterDiagnostic {
  try {
    $printers = @(Get-CimInstance Win32_Printer)
    $jobs = @(Get-CimInstance Win32_PrintJob -ErrorAction SilentlyContinue)
    $items = @()
    $issueCount = 0
    foreach ($printer in $printers) {
      $offline = [bool]$printer.WorkOffline -or ([int]$printer.PrinterStatus -eq 7)
      if ($offline) { $issueCount++ }
      $items += @{
        name = ([string]$printer.Name).Substring(0, [Math]::Min(100, ([string]$printer.Name).Length))
        default = [bool]$printer.Default
        offline = $offline
        queueCount = @($jobs | Where-Object { ([string]$_.Name).StartsWith(([string]$printer.Name) + ',') }).Count
      }
    }
    return @{ checkedAt = (Get-Date).ToUniversalTime().ToString('o'); count = $printers.Count; issueCount = $issueCount; items = $items }
  } catch {
    return @{ count = 0; issueCount = 0; items = @(); error = 'printer_query_unavailable' }
  }
}

function Get-StartupItemsInternal {
  $items = @()
  $registrySources = @(
    @{ scope = 'user-run'; path = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' },
    @{ scope = 'machine-run'; path = 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Run' },
    @{ scope = 'machine-run32'; path = 'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Run' }
  )
  foreach ($source in $registrySources) {
    if (-not (Test-Path $source.path)) { continue }
    $props = Get-ItemProperty $source.path
    foreach ($property in $props.PSObject.Properties) {
      if ($property.Name -like 'PS*') { continue }
      $id = Get-Sha256String "$($source.scope)|$($property.Name)"
      $items += [pscustomobject]@{
        id = $id; name = [string]$property.Name; scope = $source.scope; sourceType = 'registry'; registryPath = $source.path; command = [string]$property.Value; filePath = ''
      }
    }
  }
  $folders = @(
    @{ scope = 'user-startup'; path = [Environment]::GetFolderPath('Startup') },
    @{ scope = 'common-startup'; path = [Environment]::GetFolderPath('CommonStartup') }
  )
  foreach ($folder in $folders) {
    if (-not $folder.path -or -not (Test-Path $folder.path)) { continue }
    foreach ($file in @(Get-ChildItem -LiteralPath $folder.path -File -ErrorAction SilentlyContinue)) {
      $id = Get-Sha256String "$($folder.scope)|$($file.Name)"
      $items += [pscustomobject]@{
        id = $id; name = [string]$file.Name; scope = $folder.scope; sourceType = 'file'; registryPath = ''; command = ''; filePath = [string]$file.FullName
      }
    }
  }
  return $items
}

function Get-StartupDiagnostic {
  $items = @(Get-StartupItemsInternal)
  $disabled = @(Load-StartupBackup)
  return @{
    checkedAt = (Get-Date).ToUniversalTime().ToString('o')
    count = $items.Count
    disabledCount = $disabled.Count
    items = @($items | Select-Object id, name, scope | ForEach-Object { @{ id = $_.id; name = $_.name; scope = $_.scope; enabled = $true } })
    disabledItems = @($disabled | ForEach-Object { @{ id = [string]$_.id; name = [string]$_.name; scope = [string]$_.scope; enabled = $false } })
  }
}

function Load-StartupBackup {
  if (-not (Test-Path $StartupBackupPath)) { return @() }
  try { return @(Get-Content $StartupBackupPath -Raw -Encoding UTF8 | ConvertFrom-Json) } catch { return @() }
}

function Save-StartupBackup($Entries) {
  New-Item -ItemType Directory -Path $Root -Force | Out-Null
  @($Entries) | ConvertTo-Json -Depth 6 | Set-Content -Path $StartupBackupPath -Encoding UTF8
}

function Disable-StartupItem([string]$ItemId) {
  if ($ItemId -notmatch '^[a-f0-9]{64}$') { throw '시작 프로그램 항목 ID가 유효하지 않습니다.' }
  $item = @(Get-StartupItemsInternal | Where-Object { $_.id -eq $ItemId } | Select-Object -First 1)
  if (-not $item.Count) { throw '현재 시작 프로그램 목록에서 항목을 찾을 수 없습니다.' }
  $item = $item[0]
  $backups = @(Load-StartupBackup | Where-Object { $_.id -ne $ItemId })
  if ($item.sourceType -eq 'registry') {
    $backups += @{ id = $item.id; name = $item.name; scope = $item.scope; sourceType = 'registry'; registryPath = $item.registryPath; command = $item.command; disabledPath = '' }
    Remove-ItemProperty -Path $item.registryPath -Name $item.name -ErrorAction Stop
  } elseif ($item.sourceType -eq 'file') {
    New-Item -ItemType Directory -Path $StartupDisabledDir -Force | Out-Null
    $disabledPath = Join-Path $StartupDisabledDir ("$ItemId-" + [IO.Path]::GetFileName($item.filePath))
    Move-Item -LiteralPath $item.filePath -Destination $disabledPath -Force
    $backups += @{ id = $item.id; name = $item.name; scope = $item.scope; sourceType = 'file'; registryPath = ''; command = ''; originalPath = $item.filePath; disabledPath = $disabledPath }
  }
  Save-StartupBackup $backups
  return @{ message = "$($item.name) 시작 항목을 비활성화했습니다."; startup = Get-StartupDiagnostic }
}

function Restore-StartupItem([string]$ItemId) {
  if ($ItemId -notmatch '^[a-f0-9]{64}$') { throw '시작 프로그램 항목 ID가 유효하지 않습니다.' }
  $backups = @(Load-StartupBackup)
  $entry = @($backups | Where-Object { $_.id -eq $ItemId } | Select-Object -First 1)
  if (-not $entry.Count) { throw '복원 가능한 시작 프로그램 백업을 찾을 수 없습니다.' }
  $entry = $entry[0]
  if ($entry.sourceType -eq 'registry') {
    if (-not (Test-Path $entry.registryPath)) { New-Item -Path $entry.registryPath -Force | Out-Null }
    Set-ItemProperty -Path $entry.registryPath -Name $entry.name -Value $entry.command
  } elseif ($entry.sourceType -eq 'file') {
    $parent = Split-Path -Parent $entry.originalPath
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
    Move-Item -LiteralPath $entry.disabledPath -Destination $entry.originalPath -Force
  }
  Save-StartupBackup @($backups | Where-Object { $_.id -ne $ItemId })
  return @{ message = "$($entry.name) 시작 항목을 복원했습니다."; startup = Get-StartupDiagnostic }
}

function Test-RebootPending {
  $paths = @(
    'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending',
    'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired'
  )
  return @($paths | Where-Object { Test-Path $_ }).Count -gt 0
}

function Get-WindowsUpdateDiagnostic {
  try {
    $session = New-Object -ComObject Microsoft.Update.Session
    $searcher = $session.CreateUpdateSearcher()
    $search = $searcher.Search("IsInstalled=0 and IsHidden=0 and Type='Software'")
    $titles = @()
    for ($i = 0; $i -lt [Math]::Min($search.Updates.Count, 10); $i++) { $titles += [string]$search.Updates.Item($i).Title }
    return @{ checkedAt = (Get-Date).ToUniversalTime().ToString('o'); pendingCount = [int]$search.Updates.Count; titles = $titles; rebootPending = (Test-RebootPending) }
  } catch {
    return @{ pendingCount = 0; titles = @(); rebootPending = (Test-RebootPending); error = 'windows_update_query_failed' }
  }
}

function Install-WindowsUpdates {
  $session = New-Object -ComObject Microsoft.Update.Session
  $searcher = $session.CreateUpdateSearcher()
  $search = $searcher.Search("IsInstalled=0 and IsHidden=0 and Type='Software'")
  if ($search.Updates.Count -eq 0) { return @{ message = '설치할 Windows 업데이트가 없습니다.'; installedCount = 0; failedCount = 0; rebootRequired = (Test-RebootPending); updates = Get-WindowsUpdateDiagnostic } }
  $collection = New-Object -ComObject Microsoft.Update.UpdateColl
  for ($i = 0; $i -lt $search.Updates.Count; $i++) {
    $update = $search.Updates.Item($i)
    if (-not $update.EulaAccepted) { $update.AcceptEula() }
    [void]$collection.Add($update)
  }
  $downloader = $session.CreateUpdateDownloader()
  $downloader.Updates = $collection
  [void]$downloader.Download()
  $installer = $session.CreateUpdateInstaller()
  $installer.Updates = $collection
  $result = $installer.Install()
  $failed = 0
  for ($i = 0; $i -lt $collection.Count; $i++) {
    $code = $result.GetUpdateResult($i).ResultCode
    if ($code -notin @(2, 3)) { $failed++ }
  }
  return @{
    message = 'Windows 업데이트 설치를 마쳤습니다. EKODI는 자동 재부팅하지 않습니다.'
    installedCount = [int]($collection.Count - $failed)
    failedCount = [int]$failed
    rebootRequired = [bool]$result.RebootRequired
    updates = Get-WindowsUpdateDiagnostic
  }
}

function Clear-SafeTempFiles {
  $cutoff = (Get-Date).AddDays(-7)
  $roots = @($env:TEMP, (Join-Path $env:WINDIR 'Temp')) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique
  [int64]$freed = 0
  [int]$removed = 0
  foreach ($tempRoot in $roots) {
    foreach ($file in @(Get-ChildItem -LiteralPath $tempRoot -Recurse -File -Force -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -lt $cutoff })) {
      try {
        $length = [int64]$file.Length
        Remove-Item -LiteralPath $file.FullName -Force -ErrorAction Stop
        $freed += $length
        $removed++
      } catch { }
    }
  }
  return @{
    message = '7일 이상 지난 Windows/사용자 임시 파일만 정리했습니다.'
    freedMB = [math]::Round($freed / 1MB, 1)
    removedFiles = $removed
    storage = Get-StorageSnapshot
  }
}

function Write-InternetShortcut([string]$Path, [string]$Url) {
  @('[InternetShortcut]', "URL=$Url") | Set-Content -Path $Path -Encoding ASCII
}

function Apply-WorkstationProfile {
  $desktop = [Environment]::GetFolderPath('Desktop')
  $startMenu = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\EKODI'
  $desktopFolder = Join-Path $desktop 'EKODI'
  New-Item -ItemType Directory -Path $desktopFolder -Force | Out-Null
  New-Item -ItemType Directory -Path $startMenu -Force | Out-Null
  $links = @(
    @{ name = 'EKODI Admin'; url = 'https://admin.ekodi.kr' },
    @{ name = 'My EKODI'; url = 'https://ekodi.kr/my/' },
    @{ name = 'EKODI Community'; url = 'https://ekodi.kr/community' },
    @{ name = 'Marketing AI'; url = 'https://ekodi.kr/ekodibiz/marketing-ai' },
    @{ name = 'EKODI Cloud'; url = 'https://cloud.ekodi.kr' }
  )
  $created = @()
  foreach ($link in $links) {
    foreach ($folder in @($desktopFolder, $startMenu)) {
      $path = Join-Path $folder ($link.name + '.url')
      Write-InternetShortcut $path $link.url
      $created += $path
    }
  }
  @{ profile = 'ekodi-workstation'; created = $created; appliedAt = (Get-Date).ToUniversalTime().ToString('o') } | ConvertTo-Json -Depth 5 | Set-Content -Path $WorkstationProfilePath -Encoding UTF8
  return @{ message = 'EKODI 업무환경 바로가기를 바탕화면과 시작 메뉴에 구성했습니다.'; profile = 'ekodi-workstation'; settings = Get-AgentSettings }
}

function Restore-WorkstationProfile {
  if (-not (Test-Path $WorkstationProfilePath)) { throw '복원할 EKODI 업무환경 기록이 없습니다.' }
  $manifest = Get-Content $WorkstationProfilePath -Raw -Encoding UTF8 | ConvertFrom-Json
  foreach ($path in @($manifest.created)) { if ($path -and (Test-Path $path)) { Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue } }
  Remove-Item -LiteralPath $WorkstationProfilePath -Force
  return @{ message = 'EKODI가 만든 업무환경 바로가기를 제거했습니다.'; profile = ''; settings = Get-AgentSettings }
}

function Get-WorkstationProfileName {
  if (-not (Test-Path $WorkstationProfilePath)) { return '' }
  try { return [string](Get-Content $WorkstationProfilePath -Raw -Encoding UTF8 | ConvertFrom-Json).profile } catch { return '' }
}

function Register-EkodiProtocol {
  if (-not (Test-IsAdministrator)) { throw 'EKODI 연결 프로토콜 등록에는 관리자 권한이 필요합니다.' }
  New-Item -ItemType Directory -Path $Root -Force | Out-Null
  New-Item -Path $ProtocolKey -Force | Out-Null
  Set-Item -Path $ProtocolKey -Value 'URL:EKODI Device Protocol'
  New-ItemProperty -Path $ProtocolKey -Name 'URL Protocol' -Value '' -PropertyType String -Force | Out-Null
  $commandKey = Join-Path $ProtocolKey 'shell\open\command'
  New-Item -Path $commandKey -Force | Out-Null
  Set-Item -Path $commandKey -Value "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$AgentPath`" -ProtocolUrl `"%1`""
}

function Test-ProtocolRegistered {
  try {
    if (-not (Test-Path $ProtocolKey)) { return $false }
    $command = (Get-Item (Join-Path $ProtocolKey 'shell\open\command')).GetValue('')
    return ([string]$command).Contains($AgentPath)
  } catch { return $false }
}

function Get-ProtocolQueryValue([string]$Query, [string]$Name) {
  foreach ($part in $Query.TrimStart('?').Split('&')) {
    if (-not $part) { continue }
    $pair = $part.Split('=', 2)
    if ([uri]::UnescapeDataString($pair[0]) -eq $Name) {
      return $(if ($pair.Count -gt 1) { [uri]::UnescapeDataString($pair[1]) } else { '' })
    }
  }
  return ''
}

function Parse-ProtocolEnrollment([string]$Url) {
  $uri = [uri]$Url
  if ($uri.Scheme -ne $ProtocolScheme -or $uri.Host -ne 'enroll') { throw '허용되지 않은 EKODI Device 링크입니다.' }
  $code = Get-ProtocolQueryValue $uri.Query 'code'
  if ($code -notmatch '^EKD-[A-F0-9]{20}$') { throw '유효한 EKODI 1회용 등록 코드가 없습니다.' }
  $name = Get-ProtocolQueryValue $uri.Query 'label'
  if ($name.Length -gt 80) { $name = $name.Substring(0, 80) }
  return @{ enrollmentCode = $code; label = $name; apiBase = $AllowedApiBase }
}

function Test-AgentSourceSafety([string]$Content) {
  if ($Content -notmatch '\$AgentVersion\s*=') { return $false }
  $tokens = $null
  $errors = $null
  $ast = [System.Management.Automation.Language.Parser]::ParseInput($Content, [ref]$tokens, [ref]$errors)
  if ($errors.Count -gt 0) { return $false }
  $forbiddenNames = @(('Invoke-' + 'Expression'), ('i' + 'ex'))
  $actualCommands = @($ast.FindAll({ param($node) $node -is [System.Management.Automation.Language.CommandAst] }, $true) | ForEach-Object { $_.GetCommandName() } | Where-Object { $_ })
  foreach ($forbidden in $forbiddenNames) {
    if ($actualCommands -contains $forbidden) { return $false }
  }
  return $true
}

function Assert-AgentCandidate([string]$CandidatePath) {
  if (-not (Test-Path -LiteralPath $CandidatePath)) {
    Throw-AgentStageError 'EKA-100' 'candidate_validation' '업그레이드 후보 Agent 파일을 찾을 수 없습니다.'
  }
  try {
    $content = Get-Content $CandidatePath -Raw -Encoding UTF8
    if (-not (Test-AgentSourceSafety $content)) {
      Throw-AgentStageError 'EKA-101' 'candidate_validation' '업그레이드 후보 Agent의 PowerShell 안전성 검증에 실패했습니다.'
    }
    if ($content -notmatch '\$AgentVersion\s*=\s*''([^'']+)''') {
      Throw-AgentStageError 'EKA-102' 'candidate_validation' '업그레이드 후보 Agent 버전을 확인하지 못했습니다.'
    }
    return [string]$Matches[1]
  } catch {
    if ($_.Exception.Message.StartsWith('[EKODI:')) { throw }
    Throw-AgentStageError 'EKA-103' 'candidate_validation' '업그레이드 후보 Agent 검증 중 오류가 발생했습니다.' $_
  }
}

function Test-AgentRunProcess {
  try {
    foreach ($process in @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)) {
      if ([string]$process.Name -notin @('powershell.exe', 'pwsh.exe')) { continue }
      $line = [string]$process.CommandLine
      if ($line -and $line.Contains($AgentPath) -and $line -match '(?i)(?:^|\s|")-Run(?:\s|"|$)') { return $true }
    }
  } catch { }
  return $false
}

function Get-AgentTaskSnapshot {
  try {
    $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
    return @{ exists = $true; xml = (Export-ScheduledTask -TaskName $TaskName); state = [string]$task.State }
  } catch {
    return @{ exists = $false; xml = ''; state = 'Missing' }
  }
}

function Restore-AgentTaskSnapshot($Snapshot) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  if ($Snapshot -and $Snapshot.exists -and $Snapshot.xml) {
    Register-ScheduledTask -TaskName $TaskName -Xml ([string]$Snapshot.xml) -Force | Out-Null
  }
}

function Get-ProtocolSnapshot {
  if (-not (Test-Path $ProtocolKey)) { return @{ exists = $false } }
  try {
    $rootKey = Get-Item $ProtocolKey
    $commandKey = Join-Path $ProtocolKey 'shell\open\command'
    return @{
      exists = $true
      rootValue = [string]$rootKey.GetValue('')
      urlProtocol = [string]$rootKey.GetValue('URL Protocol')
      command = $(if (Test-Path $commandKey) { [string](Get-Item $commandKey).GetValue('') } else { '' })
    }
  } catch {
    Throw-AgentStageError 'EKA-111' 'snapshot' '기존 EKODI 프로토콜 상태를 읽지 못했습니다.' $_
  }
}

function Restore-ProtocolSnapshot($Snapshot) {
  Remove-Item -Path $ProtocolKey -Recurse -Force -ErrorAction SilentlyContinue
  if (-not $Snapshot -or -not $Snapshot.exists) { return }
  New-Item -Path $ProtocolKey -Force | Out-Null
  Set-Item -Path $ProtocolKey -Value ([string]$Snapshot.rootValue)
  New-ItemProperty -Path $ProtocolKey -Name 'URL Protocol' -Value ([string]$Snapshot.urlProtocol) -PropertyType String -Force | Out-Null
  if ($Snapshot.command) {
    $commandKey = Join-Path $ProtocolKey 'shell\open\command'
    New-Item -Path $commandKey -Force | Out-Null
    Set-Item -Path $commandKey -Value ([string]$Snapshot.command)
  }
}

function New-AgentUpgradeSnapshot {
  try {
    New-Item -ItemType Directory -Path $UpgradeRoot -Force | Out-Null
    $transactionPath = Join-Path $UpgradeRoot ([guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $transactionPath -Force | Out-Null
    $agentBackup = Join-Path $transactionPath 'agent.previous.ps1'
    $configBackup = Join-Path $transactionPath 'config.previous.json'
    $agentExists = Test-Path $AgentPath
    $configExists = Test-Path $ConfigPath
    if ($agentExists) { Copy-Item -LiteralPath $AgentPath -Destination $agentBackup -Force }
    if ($configExists) { Copy-Item -LiteralPath $ConfigPath -Destination $configBackup -Force }
    return @{
      transactionPath = $transactionPath
      agentExists = [bool]$agentExists
      agentBackup = $agentBackup
      configExists = [bool]$configExists
      configBackup = $configBackup
      task = Get-AgentTaskSnapshot
      protocol = Get-ProtocolSnapshot
      wasRunning = [bool](Test-AgentRunProcess)
    }
  } catch {
    Throw-AgentStageError 'EKA-110' 'snapshot' '기존 Agent 상태 백업에 실패했습니다.' $_
  }
}

function Remove-AgentUpgradeSnapshot($Snapshot) {
  if ($Snapshot -and $Snapshot.transactionPath -and (Test-Path $Snapshot.transactionPath)) {
    Remove-Item -LiteralPath $Snapshot.transactionPath -Recurse -Force -ErrorAction SilentlyContinue
  }
}

function Start-AgentProcess {
  Start-Process powershell.exe -WindowStyle Hidden -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',("`"$AgentPath`""),'-Run') | Out-Null
}

function Test-AgentHeartbeatResume {
  try {
    $config = Load-Config
    Send-Heartbeat $config
    return $true
  } catch {
    return $false
  }
}

function Restore-AgentUpgradeSnapshot($Snapshot) {
  if (-not $Snapshot) { return }
  Stop-ExistingAgentProcesses
  if ($Snapshot.agentExists -and (Test-Path $Snapshot.agentBackup)) {
    Copy-Item -LiteralPath $Snapshot.agentBackup -Destination $AgentPath -Force
  } else {
    Remove-Item -LiteralPath $AgentPath -Force -ErrorAction SilentlyContinue
  }
  if ($Snapshot.configExists -and (Test-Path $Snapshot.configBackup)) {
    Copy-Item -LiteralPath $Snapshot.configBackup -Destination $ConfigPath -Force
  } elseif (-not $Snapshot.configExists) {
    Remove-Item -LiteralPath $ConfigPath -Force -ErrorAction SilentlyContinue
  }
  Restore-AgentTaskSnapshot $Snapshot.task
  Restore-ProtocolSnapshot $Snapshot.protocol
  if ($Snapshot.configExists) {
    try {
      if ($Snapshot.task -and $Snapshot.task.exists) {
        Start-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
      }
      if (-not (Test-AgentRunProcess)) { Start-AgentProcess }
      Start-Sleep -Milliseconds 600
      [void](Test-AgentHeartbeatResume)
    } catch { }
  }
}

function Replace-AgentFileAtomically([string]$CandidatePath, $Snapshot) {
  New-Item -ItemType Directory -Path $Root -Force | Out-Null
  $stagedPath = Join-Path $Root ("agent.candidate.$([guid]::NewGuid().ToString('N')).ps1")
  Copy-Item -LiteralPath $CandidatePath -Destination $stagedPath -Force
  if (Test-Path $AgentPath) {
    $replaceBackup = Join-Path $Snapshot.transactionPath 'agent.replace-backup.ps1'
    [System.IO.File]::Replace($stagedPath, $AgentPath, $replaceBackup, $true)
  } else {
    Move-Item -LiteralPath $stagedPath -Destination $AgentPath -Force
  }
}

function Invoke-AgentUpgradeTransaction([string]$CandidatePath, [switch]$DeferRestart) {
  $stage = 'candidate_validation'
  $snapshot = $null
  try {
    $candidateVersion = Assert-AgentCandidate $CandidatePath
    Invoke-TestFailure 'candidate_validated'

    $stage = 'snapshot'
    $snapshot = New-AgentUpgradeSnapshot
    Invoke-TestFailure 'snapshot_created'

    $stage = 'stop_existing'
    if ($snapshot.configExists -or $snapshot.wasRunning) { Stop-ExistingAgentProcesses }
    Invoke-TestFailure 'existing_stopped'

    $stage = 'replace_agent'
    Replace-AgentFileAtomically $CandidatePath $snapshot
    Invoke-TestFailure 'agent_replaced'

    $stage = 'register_protocol'
    Register-EkodiProtocol
    Invoke-TestFailure 'protocol_registered'

    $stage = 'register_task'
    if ($snapshot.configExists) { Ensure-AgentTask }
    Invoke-TestFailure 'task_registered'

    if ($snapshot.configExists -and -not $DeferRestart) {
      $stage = 'start_agent'
      Start-AgentProcess
      Start-Sleep -Milliseconds 700
      if (-not (Test-AgentRunProcess)) { throw '업그레이드된 Agent 실행 프로세스를 확인하지 못했습니다.' }
      Invoke-TestFailure 'agent_started'

      $stage = 'heartbeat_verify'
      if (-not (Test-AgentHeartbeatResume)) { throw '업그레이드 후 heartbeat 재개를 확인하지 못했습니다.' }
      Invoke-TestFailure 'heartbeat_verified'
    } elseif ($snapshot.configExists) {
      $stage = 'heartbeat_verify'
      if (-not (Test-AgentHeartbeatResume)) { throw '업그레이드 후 heartbeat 확인에 실패했습니다.' }
      Invoke-TestFailure 'heartbeat_verified'
    }

    Remove-AgentUpgradeSnapshot $snapshot
    return @{ version = $candidateVersion; upgraded = $true; heartbeatVerified = [bool]$snapshot.configExists }
  } catch {
    $failure = $_
    if ($snapshot) {
      try {
        Restore-AgentUpgradeSnapshot $snapshot
        Remove-AgentUpgradeSnapshot $snapshot
      } catch {
        Throw-AgentStageError 'EKA-190' 'rollback' "업그레이드 실패 후 자동 롤백에도 실패했습니다. 원래 단계=$stage; 원래 오류=$($failure.Exception.Message)" $_
      }
    }
    $codes = @{
      candidate_validation='EKA-100'; snapshot='EKA-110'; stop_existing='EKA-120'; replace_agent='EKA-130'
      register_protocol='EKA-140'; register_task='EKA-150'; start_agent='EKA-160'; heartbeat_verify='EKA-170'
    }
    $code = if ($codes.ContainsKey($stage)) { $codes[$stage] } else { 'EKA-199' }
    Throw-AgentStageError $code $stage 'Agent 설치·업그레이드를 중단하고 이전 상태로 롤백했습니다.' $failure
  }
}

function Update-AgentFromOfficialSource {
  $temp = Join-Path $env:TEMP 'ekodi-device-agent-update.ps1'
  Invoke-WebRequest -UseBasicParsing $AgentSourceUrl -OutFile $temp
  [void](Assert-AgentCandidate $temp)
  $result = Invoke-AgentUpgradeTransaction -CandidatePath $temp -DeferRestart
  return @{ message = "EKODI Device Agent를 트랜잭션 방식으로 $($result.version) 버전으로 업데이트했습니다. 명령 결과 전송 후 Agent를 안전 재시작합니다."; restartRequired = $true; version = $result.version; settings = Get-AgentSettings }
}

function Get-AgentSettings {
  $scheme = ''
  try { $scheme = Get-ActiveSchemeGuid } catch { $scheme = 'unknown' }
  return @{
    activePowerScheme = $scheme
    powerBackupAvailable = (Test-Path $PowerBackupPath)
    autologon = 'local-consent-only'
    protocolRegistered = (Test-ProtocolRegistered)
    workstationProfile = Get-WorkstationProfileName
    health = Get-LightHealth
    backgroundBrowserCanary = Get-BackgroundBrowserCanaryState
  }
}

function Get-RemoteProcessList {
  try {
    $items = @(Get-Process -ErrorAction Stop |
      Sort-Object -Property CPU -Descending |
      Select-Object -First 100 |
      ForEach-Object {
        @{
          id = [int]$_.Id
          name = [string]$_.ProcessName
          cpuSeconds = $(if ($null -ne $_.CPU) { [math]::Round([double]$_.CPU, 1) } else { $null })
          memoryMB = [math]::Round([double]$_.WorkingSet64 / 1MB, 1)
        }
      })
    return @{ checkedAt = (Get-Date).ToUniversalTime().ToString('o'); count = $items.Count; items = $items }
  } catch {
    return @{ checkedAt = (Get-Date).ToUniversalTime().ToString('o'); count = 0; items = @(); error = 'process_list_unavailable' }
  }
}

function Resolve-EkodiBrowser {
  $candidates = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe"
  )
  return ($candidates | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1)
}

function Get-BackgroundBrowserCanaryState {
  if (-not (Test-Path -LiteralPath $BrowserCanaryStatePath)) {
    return @{ verified = $false; checkedAt = ''; agentVersion = $AgentVersion }
  }
  try {
    $state = Get-Content -LiteralPath $BrowserCanaryStatePath -Raw -Encoding UTF8 | ConvertFrom-Json
    $verified = (
      $state.ok -eq $true -and
      [string]$state.agentVersion -eq $AgentVersion -and
      $state.dedicatedAutomationProfile -eq $true -and
      $state.offscreenOrHeadless -eq $true -and
      $state.focusIsolated -eq $true -and
      $state.clipboardShared -eq $false -and
      $state.userInputInjection -eq $false -and
      [string]$state.url -eq $BrowserCanaryUrl
    )
    return @{
      verified = [bool]$verified
      checkedAt = [string]$state.checkedAt
      agentVersion = [string]$state.agentVersion
      browser = [string]$state.browser
      url = [string]$state.url
      dedicatedAutomationProfile = [bool]$state.dedicatedAutomationProfile
      offscreenOrHeadless = [bool]$state.offscreenOrHeadless
      focusIsolated = [bool]$state.focusIsolated
      clipboardShared = [bool]$state.clipboardShared
      userInputInjection = [bool]$state.userInputInjection
    }
  } catch {
    return @{ verified = $false; checkedAt = ''; agentVersion = $AgentVersion; error = 'canary_state_invalid' }
  }
}

function Invoke-BackgroundBrowserCanary {
  Remove-Item -LiteralPath $BrowserCanaryStatePath -Force -ErrorAction SilentlyContinue
  $browser = Resolve-EkodiBrowser
  if (-not $browser) { throw 'supported_browser_not_found' }
  New-Item -ItemType Directory -Path $BrowserCanaryProfileRoot -Force | Out-Null

  $arguments = @(
    '--headless=new',
    '--disable-gpu',
    '--disable-extensions',
    '--disable-sync',
    '--no-first-run',
    '--no-default-browser-check',
    "--user-data-dir=`"$BrowserCanaryProfileRoot`"",
    '--dump-dom',
    "`"$BrowserCanaryUrl`""
  ) -join ' '

  $process = [Diagnostics.Process]::new()
  $process.StartInfo = [Diagnostics.ProcessStartInfo]@{
    FileName = $browser
    Arguments = $arguments
    UseShellExecute = $false
    CreateNoWindow = $true
    RedirectStandardOutput = $true
    RedirectStandardError = $true
  }
  [void]$process.Start()
  $stdoutTask = $process.StandardOutput.ReadToEndAsync()
  $stderrTask = $process.StandardError.ReadToEndAsync()
  if (-not $process.WaitForExit(25000)) {
    try { $process.Kill() } catch { }
    throw 'background_browser_timeout'
  }
  $stdout = $stdoutTask.GetAwaiter().GetResult()
  $stderr = $stderrTask.GetAwaiter().GetResult()
  $ok = ($process.ExitCode -eq 0 -and $stdout.Length -gt 0)
  $proof = @{
    ok = [bool]$ok
    mode = 'background-browser-canary'
    agentVersion = $AgentVersion
    browser = [IO.Path]::GetFileName($browser)
    url = $BrowserCanaryUrl
    exitCode = $process.ExitCode
    contentBytes = [Text.Encoding]::UTF8.GetByteCount($stdout)
    dedicatedAutomationProfile = $true
    offscreenOrHeadless = $true
    focusIsolated = $true
    clipboardShared = $false
    userInputInjection = $false
    checkedAt = (Get-Date).ToUniversalTime().ToString('o')
    stderrSummary = $(if ($stderr) { $stderr.Substring(0, [Math]::Min(300, $stderr.Length)) } else { '' })
  }
  if (-not $ok) { throw 'background_browser_canary_failed' }
  New-Item -ItemType Directory -Path $Root -Force | Out-Null
  $proof | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $BrowserCanaryStatePath -Encoding UTF8
  return @{ message = 'Background Browser canary를 사용자 화면 개입 없이 검증했습니다. 검증된 버전에서만 EKODI 자체 Browser Worker를 사용할 수 있습니다.'; browserCanary = $proof }
}

function Resolve-EkodiBrowserTaskUrl([string]$Path) {
  $value = if ($Path) { $Path.Trim() } else { '/' }
  if ($value.Length -gt 600) { throw 'browser_path_too_long' }
  if (-not $value.StartsWith('/') -or $value.StartsWith('//')) { throw 'browser_path_must_be_root_relative' }
  if ($value -match '[\x00-\x1F]') { throw 'browser_path_control_character_forbidden' }
  try {
    $base = [Uri]'https://ekodi.kr/'
    $uri = [Uri]::new($base, $value)
  } catch {
    throw 'browser_path_invalid'
  }
  if ($uri.Scheme -ne 'https' -or $uri.Host -ne 'ekodi.kr' -or -not $uri.IsDefaultPort -or $uri.UserInfo) {
    throw 'browser_target_must_be_canonical_ekodi'
  }
  return $uri.AbsoluteUri
}

function Resolve-EkodiBrowserViewport([string]$Profile) {
  switch ($Profile) {
    'compact-mobile' { return @{ id = 'compact-mobile'; width = 320; height = 568 } }
    'mobile-portrait' { return @{ id = 'mobile-portrait'; width = 390; height = 844 } }
    'mobile-landscape' { return @{ id = 'mobile-landscape'; width = 844; height = 390 } }
    'tablet' { return @{ id = 'tablet'; width = 768; height = 1024 } }
    'desktop' { return @{ id = 'desktop'; width = 1440; height = 900 } }
    default { throw 'browser_device_profile_invalid' }
  }
}

function Get-EkodiBackgroundAuthState([int]$StatusCode, [string]$Content) {
  if ($StatusCode -eq 401 -or $StatusCode -eq 403) { return 'required' }
  if (-not $Content) { return 'not-required' }
  try {
    $json = $Content | ConvertFrom-Json
    if ($json.PSObject.Properties.Name -contains 'authenticated' -and $json.authenticated -eq $false) { return 'required' }
    if ($json.PSObject.Properties.Name -contains 'code' -and [string]$json.code -match '(?i)AUTH_REQUIRED|LOGIN_REQUIRED|SESSION_REQUIRED') { return 'required' }
  } catch { }
  return 'not-required'
}

function Invoke-EkodiBackgroundHttpGet([string]$Target) {
  $handler = [Net.Http.HttpClientHandler]::new()
  $handler.AllowAutoRedirect = $false
  $client = [Net.Http.HttpClient]::new($handler)
  $client.Timeout = [TimeSpan]::FromSeconds(25)
  try {
    $response = $client.GetAsync($Target).GetAwaiter().GetResult()
    try {
      $content = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
      return @{ statusCode = [int]$response.StatusCode; content = [string]$content }
    } finally {
      $response.Dispose()
    }
  } finally {
    $client.Dispose()
    $handler.Dispose()
  }
}

function Receive-EkodiCdpResponse($Socket, [int]$ExpectedId, [int]$TimeoutMs = 15000) {
  $buffer = New-Object byte[] 65536
  $deadline = [DateTime]::UtcNow.AddMilliseconds($TimeoutMs)
  while ([DateTime]::UtcNow -lt $deadline) {
    $remaining = [int][Math]::Max(250, ($deadline - [DateTime]::UtcNow).TotalMilliseconds)
    $cts = [Threading.CancellationTokenSource]::new($remaining)
    try {
      $stream = [IO.MemoryStream]::new()
      do {
        $segment = [ArraySegment[byte]]::new($buffer)
        $result = $Socket.ReceiveAsync($segment, $cts.Token).GetAwaiter().GetResult()
        if ($result.MessageType -eq [Net.WebSockets.WebSocketMessageType]::Close) { throw 'cdp_socket_closed' }
        if ($result.Count -gt 0) { $stream.Write($buffer, 0, $result.Count) }
      } while (-not $result.EndOfMessage)
      $json = [Text.Encoding]::UTF8.GetString($stream.ToArray())
      if (-not $json) { continue }
      $message = $json | ConvertFrom-Json
      if ($message.PSObject.Properties.Name -contains 'id' -and [int]$message.id -eq $ExpectedId) {
        return $message
      }
    } finally {
      $cts.Dispose()
    }
  }
  throw "cdp_response_timeout:$ExpectedId"
}

function Invoke-EkodiCdpCommand($Socket, [int]$Id, [string]$Method, $Params = $null) {
  $payload = @{ id = $Id; method = $Method }
  if ($null -ne $Params) { $payload.params = $Params }
  $json = $payload | ConvertTo-Json -Depth 10 -Compress
  $bytes = [Text.Encoding]::UTF8.GetBytes($json)
  $cts = [Threading.CancellationTokenSource]::new(10000)
  try {
    $Socket.SendAsync(
      [ArraySegment[byte]]::new($bytes),
      [Net.WebSockets.WebSocketMessageType]::Text,
      $true,
      $cts.Token
    ).GetAwaiter().GetResult()
  } finally {
    $cts.Dispose()
  }
  $response = Receive-EkodiCdpResponse $Socket $Id
  if ($response.PSObject.Properties.Name -contains 'error' -and $response.error) {
    throw "cdp_command_failed:${Method}:$([string]$response.error.message)"
  }
  return $response
}

function Invoke-EkodiHeadlessScreenshot(
  [string]$Browser,
  [string]$Target,
  [string]$TaskProfile,
  [string]$ScreenshotPath,
  $Viewport
) {
  $arguments = @(
    '--headless=new',
    '--disable-gpu',
    '--disable-extensions',
    '--disable-sync',
    '--disable-background-networking',
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    '--blink-settings=scriptEnabled=false',
    '--remote-debugging-port=0',
    "--window-size=$($Viewport.width),$($Viewport.height)",
    "--user-data-dir=$TaskProfile",
    "$Target"
  ) -join ' '

  $process = [Diagnostics.Process]::new()
  $process.StartInfo = [Diagnostics.ProcessStartInfo]@{
    FileName = $Browser
    Arguments = $arguments
    UseShellExecute = $false
    CreateNoWindow = $true
    RedirectStandardOutput = $true
    RedirectStandardError = $true
  }

  $socket = $null
  try {
    [void]$process.Start()
    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()

    $portFile = Join-Path $TaskProfile 'DevToolsActivePort'
    $deadline = [DateTime]::UtcNow.AddSeconds(20)
    while (-not (Test-Path -LiteralPath $portFile) -and [DateTime]::UtcNow -lt $deadline) {
      Start-Sleep -Milliseconds 150
    }
    if (-not (Test-Path -LiteralPath $portFile)) { throw 'cdp_port_file_missing' }

    $portLines = @(Get-Content -LiteralPath $portFile -Encoding UTF8)
    if ($portLines.Count -lt 1 -or [int]$portLines[0] -le 0) { throw 'cdp_port_invalid' }
    $port = [int]$portLines[0]

    $targets = Invoke-RestMethod -Uri "http://127.0.0.1:$port/json/list" -Method Get -TimeoutSec 10
    $page = @($targets | Where-Object { $_.type -eq 'page' } | Select-Object -First 1)[0]
    if (-not $page -or -not $page.webSocketDebuggerUrl) { throw 'cdp_page_target_missing' }

    $socket = [Net.WebSockets.ClientWebSocket]::new()
    $connectCts = [Threading.CancellationTokenSource]::new(10000)
    try {
      $socket.ConnectAsync([Uri]$page.webSocketDebuggerUrl, $connectCts.Token).GetAwaiter().GetResult()
    } finally {
      $connectCts.Dispose()
    }

    [void](Invoke-EkodiCdpCommand $socket 1 'Page.enable' @{})
    [void](Invoke-EkodiCdpCommand $socket 2 'Emulation.setDeviceMetricsOverride' @{
      width = [int]$Viewport.width
      height = [int]$Viewport.height
      deviceScaleFactor = 1
      mobile = $false
    })
    [void](Invoke-EkodiCdpCommand $socket 3 'Page.navigate' @{ url = $Target })
    Start-Sleep -Milliseconds 1200
    $capture = Invoke-EkodiCdpCommand $socket 4 'Page.captureScreenshot' @{
      format = 'png'
      fromSurface = $true
      captureBeyondViewport = $false
    }

    $data = [string]$capture.result.data
    if (-not $data) { throw 'cdp_screenshot_data_missing' }
    $bytes = [Convert]::FromBase64String($data)
    if ($bytes.Length -le 0) { throw 'cdp_screenshot_empty' }
    [IO.File]::WriteAllBytes($ScreenshotPath, $bytes)

    return @{
      processId = $process.Id
      browserExitCode = $null
      cdpPort = $port
      pageUrl = [string]$page.url
      screenshotBytes = [long]$bytes.Length
    }
  } finally {
    if ($socket) {
      try {
        $closeCts = [Threading.CancellationTokenSource]::new(2000)
        $socket.CloseAsync([Net.WebSockets.WebSocketCloseStatus]::NormalClosure, 'done', $closeCts.Token).GetAwaiter().GetResult()
        $closeCts.Dispose()
      } catch { }
      try { $socket.Dispose() } catch { }
    }
    if (-not $process.HasExited) {
      try { $process.Kill() } catch { }
      try { [void]$process.WaitForExit(5000) } catch { }
    }
    try { [void]$stdoutTask.GetAwaiter().GetResult() } catch { }
    try { [void]$stderrTask.GetAwaiter().GetResult() } catch { }
    try { $process.Dispose() } catch { }
  }
}

function Invoke-BackgroundBrowserWorker($Payload) {
  $canary = Get-BackgroundBrowserCanaryState
  if (-not $canary.verified) { throw 'background_browser_canary_required' }

  if ([string]$Payload.executionMode -ne 'background-only') { throw 'background_browser_mode_must_be_background_only' }
  if ($Payload.createUserBrowserTab -ne $false) { throw 'background_browser_user_tab_forbidden' }
  if ($Payload.closeOwnedSurfaceOnComplete -ne $true) { throw 'background_browser_cleanup_required' }
  if ($Payload.closeOwnedSurfaceOnAuthRequired -ne $true) { throw 'background_browser_auth_cleanup_required' }
  if ($Payload.preserveUserOwnedSurfaces -ne $true) { throw 'background_browser_user_surface_protection_required' }

  $target = Resolve-EkodiBrowserTaskUrl ([string]$Payload.path)
  $profileName = if ($Payload.PSObject.Properties.Name -contains 'deviceProfile' -and $Payload.deviceProfile) { [string]$Payload.deviceProfile } else { 'desktop' }
  $viewport = Resolve-EkodiBrowserViewport $profileName
  $browser = Resolve-EkodiBrowser
  if (-not $browser) { throw 'supported_browser_not_found' }

  New-Item -ItemType Directory -Path $BrowserWorkerProfileRoot -Force | Out-Null
  $taskId = [guid]::NewGuid().ToString('N')
  $taskProfile = Join-Path $BrowserWorkerProfileRoot ("Task-" + $taskId)
  $shotDir = Join-Path $BrowserWorkerProfileRoot ("Artifact-" + $taskId)
  $shotPath = Join-Path $shotDir 'surface.png'
  New-Item -ItemType Directory -Path $taskProfile -Force | Out-Null
  New-Item -ItemType Directory -Path $shotDir -Force | Out-Null

  $proof = $null
  try {
    $http = Invoke-EkodiBackgroundHttpGet $target
    $stdout = [string]$http.content
    $statusCode = [int]$http.statusCode
    $authState = Get-EkodiBackgroundAuthState $statusCode $stdout
    if ($authState -eq 'required') {
      $proof = @{
        ok = $false
        outcome = 'auth-required'
        code = 'AUTH_REQUIRED'
        mode = 'background-browser-worker'
        executionMode = 'background-only'
        virtualizationProvider = 'ekodi-native-remote-computer'
        routingPolicy = 'EKODI-VIRTUALIZATION-ROUTING-001'
        agentVersion = $AgentVersion
        taskId = $taskId
        browser = [IO.Path]::GetFileName($browser)
        url = $target
        httpStatus = $statusCode
        authRequired = $true
        interactiveLoginOpened = $false
        createUserBrowserTab = $false
        ownedAutomationSurfaceAutoClosed = $true
        userOwnedSurfacesPreserved = $true
        temporaryProfileRemoved = $false
        screenshotArtifactRemoved = $false
        checkedAt = (Get-Date).ToUniversalTime().ToString('o')
      }
    } else {
      if ($stdout.Length -le 0) { throw 'background_browser_dom_failed' }
      if ($statusCode -lt 200 -or $statusCode -ge 300) { throw 'background_browser_http_status_failed' }

      $capture = Invoke-EkodiHeadlessScreenshot $browser $target $taskProfile $shotPath $viewport
    $screenshotExists = Test-Path -LiteralPath $shotPath
    if (-not $screenshotExists) { throw 'background_browser_screenshot_failed:cdp_no_file' }
    $stderr = ''
    $shot = Get-Item -LiteralPath $shotPath
    $proof = @{
      ok = $true
      mode = 'background-browser-worker'
      virtualizationProvider = 'ekodi-native-remote-computer'
      routingPolicy = 'EKODI-VIRTUALIZATION-ROUTING-001'
      agentVersion = $AgentVersion
      taskId = $taskId
      browser = [IO.Path]::GetFileName($browser)
      url = $target
      deviceProfile = $viewport.id
      viewportWidth = [int]$viewport.width
      viewportHeight = [int]$viewport.height
      exitCode = 0
      httpStatus = $statusCode
      contentSource = 'canonical-http-get'
      httpMethod = 'GET'
      screenshotTransport = 'chrome-devtools-protocol'
      cdpPortAssigned = [bool]($capture.cdpPort -gt 0)
      browserProcessIdObserved = [bool]($capture.processId -gt 0)
      contentBytes = [Text.Encoding]::UTF8.GetByteCount($stdout)
      contentSha256 = Get-Sha256String $stdout
      screenshotBytes = [long]$shot.Length
      screenshotSha256 = [string](Get-FileHash -LiteralPath $shotPath -Algorithm SHA256).Hash.ToLowerInvariant()
      dedicatedAutomationProfile = $true
      ephemeralProfile = $true
      activeUserProfileReused = $false
      offscreenOrHeadless = $true
      focusIsolated = $true
      clipboardShared = $false
      userInputInjection = $false
      javascriptEnabled = $false
      mutationMode = 'read-only-static-surface'
      checkedAt = (Get-Date).ToUniversalTime().ToString('o')
      stderrSummary = $(if ($stderr) { $stderr.Substring(0, [Math]::Min(300, $stderr.Length)) } else { '' })
      profileRemoved = $false
      screenshotArtifactRemoved = $false
      executionMode = 'background-only'
      createUserBrowserTab = $false
      ownedAutomationSurfaceAutoClosed = $true
      userOwnedSurfacesPreserved = $true
      authRequired = $false
      interactiveLoginOpened = $false
    }
    }
  } finally {
    Remove-Item -LiteralPath $taskProfile -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $shotDir -Recurse -Force -ErrorAction SilentlyContinue
    if ($proof) {
      $proof.profileRemoved = -not (Test-Path -LiteralPath $taskProfile)
      $proof.temporaryProfileRemoved = $proof.profileRemoved
      $proof.screenshotArtifactRemoved = -not (Test-Path -LiteralPath $shotDir)
    }
  }

  if (-not $proof -or -not $proof.profileRemoved -or -not $proof.screenshotArtifactRemoved) { throw 'background_browser_profile_cleanup_failed' }
  if ($proof.authRequired -eq $true) {
    return @{ message = '인증이 필요한 자동작업을 사용자 화면에 열지 않고 AUTH_REQUIRED로 기록한 뒤 백그라운드 세션을 종료했습니다.'; browserWorker = $proof }
  }
  return @{ message = 'EKODI 자체 Background Browser Worker가 사용자 화면과 분리된 작업을 완료하고 임시 브라우저 세션을 종료했습니다.'; browserWorker = $proof }
}

function Get-WindowsOptionalFeatureStateSafe([string]$Name) {
  try {
    $feature = Get-WindowsOptionalFeature -Online -FeatureName $Name -ErrorAction Stop
    return [string]$feature.State
  } catch {
    return 'unknown'
  }
}

function Get-IsolatedDesktopBackendProbe {
  $virtualizationFirmwareEnabled = $false
  try {
    $processors = @(Get-CimInstance Win32_Processor -ErrorAction Stop)
    if ($processors.Count -gt 0) {
      $virtualizationFirmwareEnabled = (@($processors | Where-Object { $_.VirtualizationFirmwareEnabled -eq $true }).Count -gt 0)
    }
  } catch { }

  $hyperVState = Get-WindowsOptionalFeatureStateSafe 'Microsoft-Hyper-V-All'
  $sandboxState = Get-WindowsOptionalFeatureStateSafe 'Containers-DisposableClientVM'
  $hyperVPowerShellAvailable = [bool](Get-Command Get-VM -ErrorAction SilentlyContinue)
  $baseVmPresent = $false
  if ($hyperVPowerShellAvailable) {
    try {
      $baseVm = Get-VM -Name 'EKODI-Isolated-Base' -ErrorAction Stop
      $baseVmPresent = ($null -ne $baseVm)
    } catch { }
  }

  $sandboxPath = Join-Path $env:WINDIR 'System32\WindowsSandbox.exe'
  $windowsSandboxPresent = Test-Path -LiteralPath $sandboxPath
  $hyperVEnabled = ($hyperVState -eq 'Enabled')
  $sandboxEnabled = ($sandboxState -eq 'Enabled')
  $headlessBackendReady = (
    $virtualizationFirmwareEnabled -and
    $hyperVEnabled -and
    $hyperVPowerShellAvailable -and
    $baseVmPresent
  )

  $recommendedBackend = 'none'
  if ($headlessBackendReady) {
    $recommendedBackend = 'hyper-v-ekodi-base'
  } elseif ($sandboxEnabled -and $windowsSandboxPresent) {
    $recommendedBackend = 'windows-sandbox-detected-not-activation-eligible'
  }

  $gapReason = ''
  if (-not $headlessBackendReady) {
    if (-not $virtualizationFirmwareEnabled) {
      $gapReason = 'native-capability-unavailable'
    } elseif (-not $hyperVEnabled -or -not $hyperVPowerShellAvailable) {
      $gapReason = 'native-capability-not-production-ready'
    } elseif (-not $baseVmPresent) {
      $gapReason = 'required-capability-not-yet-implemented'
    } else {
      $gapReason = 'native-capacity-or-runtime-failure'
    }
  }

  return @{
    ok = $true
    mode = 'isolated-desktop-backend-probe'
    provider = 'ekodi-native-remote-computer'
    routingPolicy = 'EKODI-VIRTUALIZATION-ROUTING-001'
    backendPolicy = 'EKODI-ISOLATED-DESKTOP-BACKEND-001'
    agentVersion = $AgentVersion
    virtualizationFirmwareEnabled = [bool]$virtualizationFirmwareEnabled
    hyperVState = $hyperVState
    hyperVPowerShellAvailable = [bool]$hyperVPowerShellAvailable
    baseVmName = 'EKODI-Isolated-Base'
    baseVmPresent = [bool]$baseVmPresent
    windowsSandboxState = $sandboxState
    windowsSandboxPresent = [bool]$windowsSandboxPresent
    windowsSandboxForegroundOnly = $true
    windowsSandboxAcceptedForActivation = $false
    recommendedBackend = $recommendedBackend
    headlessBackendReady = [bool]$headlessBackendReady
    isolatedDesktopActivationReady = [bool]$headlessBackendReady
    sharedInteractiveDesktop = $false
    userInputInjection = $false
    clipboardShared = $false
    credentialCollection = $false
    gapReason = $gapReason
    checkedAt = (Get-Date).ToUniversalTime().ToString('o')
  }
}

function Invoke-IsolatedDesktopBackendProbe {
  $probe = Get-IsolatedDesktopBackendProbe
  return @{
    message = $(if ($probe.headlessBackendReady) { 'EKODI 자체 격리 데스크톱용 headless Hyper-V 백엔드가 준비되어 있습니다.' } else { 'EKODI 자체 격리 데스크톱 백엔드 상태를 확인했습니다. 실행 권한은 검증 전까지 비활성 상태입니다.' })
    desktopProbe = $probe
  }
}

function Get-IsolatedDesktopCanaryState {
  if (-not (Test-Path -LiteralPath $IsolatedDesktopCanaryStatePath)) {
    return @{ verified = $false; checkedAt = ''; agentVersion = $AgentVersion }
  }
  try {
    $state = Get-Content -LiteralPath $IsolatedDesktopCanaryStatePath -Raw -Encoding UTF8 | ConvertFrom-Json
    $verified = (
      $state.ok -eq $true -and
      [string]$state.agentVersion -eq $AgentVersion -and
      [string]$state.mode -eq 'isolated-desktop-hyperv-canary' -and
      [string]$state.backend -eq 'hyper-v-ekodi-base' -and
      $state.headless -eq $true -and
      $state.networkAttached -eq $false -and
      $state.sharedInteractiveDesktop -eq $false -and
      $state.clipboardShared -eq $false -and
      $state.userInputInjection -eq $false -and
      $state.credentialCollection -eq $false -and
      $state.ephemeralDifferencingDisk -eq $true -and
      $state.sessionVmRemoved -eq $true -and
      $state.sessionDiskRemoved -eq $true
    )
    return @{
      verified = [bool]$verified
      checkedAt = [string]$state.checkedAt
      agentVersion = [string]$state.agentVersion
      backend = [string]$state.backend
      headless = [bool]$state.headless
      networkAttached = [bool]$state.networkAttached
      sessionVmRemoved = [bool]$state.sessionVmRemoved
      sessionDiskRemoved = [bool]$state.sessionDiskRemoved
    }
  } catch {
    return @{ verified = $false; checkedAt = ''; agentVersion = $AgentVersion; error = 'isolated_desktop_canary_state_invalid' }
  }
}

function Invoke-IsolatedDesktopHyperVCanary {
  Remove-Item -LiteralPath $IsolatedDesktopCanaryStatePath -Force -ErrorAction SilentlyContinue
  $probe = Get-IsolatedDesktopBackendProbe
  if (-not $probe.headlessBackendReady -or $probe.recommendedBackend -ne 'hyper-v-ekodi-base') {
    throw "isolated_desktop_headless_backend_not_ready:$($probe.gapReason)"
  }

  $baseVmName = 'EKODI-Isolated-Base'
  $baseVm = Get-VM -Name $baseVmName -ErrorAction Stop
  if ([string]$baseVm.State -ne 'Off') { throw 'isolated_desktop_base_vm_must_be_off' }
  $baseDisks = @(Get-VMHardDiskDrive -VMName $baseVmName -ErrorAction Stop)
  if ($baseDisks.Count -ne 1) { throw 'isolated_desktop_base_vm_requires_single_disk' }
  $baseDiskPath = [string]$baseDisks[0].Path
  if (-not $baseDiskPath -or -not (Test-Path -LiteralPath $baseDiskPath)) { throw 'isolated_desktop_base_disk_missing' }

  New-Item -ItemType Directory -Path $IsolatedDesktopSessionRoot -Force | Out-Null
  $sessionId = [guid]::NewGuid().ToString('N')
  $sessionName = "EKODI-Isolated-$sessionId"
  $sessionDir = Join-Path $IsolatedDesktopSessionRoot $sessionId
  $sessionDisk = Join-Path $sessionDir 'session.vhdx'
  New-Item -ItemType Directory -Path $sessionDir -Force | Out-Null

  $vmCreated = $false
  $vmStarted = $false
  $proof = $null
  try {
    New-VHD -Path $sessionDisk -ParentPath $baseDiskPath -Differencing -ErrorAction Stop | Out-Null
    $memory = 2GB
    $vm = New-VM -Name $sessionName -Generation ([int]$baseVm.Generation) -MemoryStartupBytes $memory -VHDPath $sessionDisk -ErrorAction Stop
    $vmCreated = $true
    Get-VMNetworkAdapter -VMName $sessionName -ErrorAction SilentlyContinue | Remove-VMNetworkAdapter -ErrorAction SilentlyContinue
    Set-VM -Name $sessionName -AutomaticStartAction Nothing -AutomaticStopAction TurnOff -AutomaticCheckpointsEnabled $false -ErrorAction Stop
    if ([int]$baseVm.Generation -eq 2) {
      Set-VMFirmware -VMName $sessionName -EnableSecureBoot On -ErrorAction Stop
    }

    Start-VM -Name $sessionName -ErrorAction Stop | Out-Null
    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    do {
      Start-Sleep -Milliseconds 500
      $state = [string](Get-VM -Name $sessionName -ErrorAction Stop).State
      if ($state -eq 'Running') { $vmStarted = $true; break }
    } while ([DateTime]::UtcNow -lt $deadline)
    if (-not $vmStarted) { throw 'isolated_desktop_vm_start_timeout' }

    $proof = @{
      ok = $true
      mode = 'isolated-desktop-hyperv-canary'
      provider = 'ekodi-native-remote-computer'
      routingPolicy = 'EKODI-VIRTUALIZATION-ROUTING-001'
      backendPolicy = 'EKODI-ISOLATED-DESKTOP-BACKEND-001'
      agentVersion = $AgentVersion
      backend = 'hyper-v-ekodi-base'
      sessionType = 'vm'
      sessionId = $sessionId
      baseVmName = $baseVmName
      baseVmGeneration = [int]$baseVm.Generation
      baseDiskPathSha256 = Get-Sha256String $baseDiskPath
      headless = $true
      networkAttached = $false
      sharedInteractiveDesktop = $false
      clipboardShared = $false
      userInputInjection = $false
      credentialCollection = $false
      ephemeralDifferencingDisk = $true
      baseDiskWriteForbidden = $true
      secureBootRequested = ([int]$baseVm.Generation -eq 2)
      vmReachedRunning = $true
      boundedStartWaitSeconds = 30
      sessionVmRemoved = $false
      sessionDiskRemoved = $false
      checkedAt = (Get-Date).ToUniversalTime().ToString('o')
    }
  } finally {
    if ($vmCreated) {
      try {
        $existing = Get-VM -Name $sessionName -ErrorAction SilentlyContinue
        if ($existing -and [string]$existing.State -ne 'Off') {
          Stop-VM -Name $sessionName -TurnOff -Force -ErrorAction SilentlyContinue
        }
      } catch { }
      try { Remove-VM -Name $sessionName -Force -ErrorAction SilentlyContinue } catch { }
    }
    Remove-Item -LiteralPath $sessionDir -Recurse -Force -ErrorAction SilentlyContinue
    if ($proof) {
      $proof.sessionVmRemoved = -not [bool](Get-VM -Name $sessionName -ErrorAction SilentlyContinue)
      $proof.sessionDiskRemoved = -not (Test-Path -LiteralPath $sessionDisk)
    }
  }

  if (-not $proof -or -not $proof.sessionVmRemoved -or -not $proof.sessionDiskRemoved) {
    throw 'isolated_desktop_canary_cleanup_failed'
  }
  New-Item -ItemType Directory -Path $Root -Force | Out-Null
  $proof | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $IsolatedDesktopCanaryStatePath -Encoding UTF8
  return @{
    message = 'EKODI 자체 Hyper-V 격리 데스크톱 canary를 사용자 화면과 분리해 생성·부팅·폐기했습니다. 실제 데스크톱 작업 실행 권한은 아직 비활성입니다.'
    desktopCanary = $proof
  }
}

function New-EkodiNonceHex([int]$Bytes = 32) {
  $buffer = New-Object byte[] $Bytes
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($buffer)
    return ([BitConverter]::ToString($buffer)).Replace('-','').ToLowerInvariant()
  } finally {
    $rng.Dispose()
  }
}

function Mount-EkodiGuestWindowsVolume([string]$VhdPath) {
  Mount-VHD -Path $VhdPath -ErrorAction Stop | Out-Null
  try {
    $diskImage = Get-DiskImage -ImagePath $VhdPath -ErrorAction Stop
    $disk = $diskImage | Get-Disk -ErrorAction Stop
    if ($disk.IsOffline) { Set-Disk -Number $disk.Number -IsOffline $false -ErrorAction Stop }
    if ($disk.IsReadOnly) { Set-Disk -Number $disk.Number -IsReadOnly $false -ErrorAction Stop }
    foreach ($partition in @(Get-Partition -DiskNumber $disk.Number -ErrorAction Stop | Sort-Object Size -Descending)) {
      if ($partition.Size -lt 2GB) { continue }
      $current = $partition
      if (-not $current.DriveLetter) {
        try {
          Add-PartitionAccessPath -DiskNumber $disk.Number -PartitionNumber $current.PartitionNumber -AssignDriveLetter -ErrorAction Stop
          $current = Get-Partition -DiskNumber $disk.Number -PartitionNumber $current.PartitionNumber -ErrorAction Stop
        } catch { continue }
      }
      if (-not $current.DriveLetter) { continue }
      $root = "$([string]$current.DriveLetter):\"
      if (Test-Path -LiteralPath (Join-Path $root 'Windows')) {
        return @{ root = $root; diskNumber = [int]$disk.Number; partitionNumber = [int]$current.PartitionNumber }
      }
    }
    throw 'isolated_guest_windows_volume_not_found'
  } catch {
    Dismount-VHD -Path $VhdPath -ErrorAction SilentlyContinue
    throw
  }
}

function Dismount-EkodiGuestWindowsVolume([string]$VhdPath) {
  Dismount-VHD -Path $VhdPath -ErrorAction SilentlyContinue
}

function Write-EkodiGuestRuntimeTask([string]$VhdPath, $Task) {
  $mount = Mount-EkodiGuestWindowsVolume $VhdPath
  try {
    $guestRoot = Join-Path $mount.root 'ProgramData\EKODI\GuestAgent'
    $guestAgent = Join-Path $guestRoot 'ekodi-isolated-guest-agent.ps1'
    if (-not (Test-Path -LiteralPath $guestAgent)) { throw 'isolated_guest_agent_not_provisioned' }
    New-Item -ItemType Directory -Path $guestRoot -Force | Out-Null
    Remove-Item -LiteralPath (Join-Path $guestRoot 'receipt.json') -Force -ErrorAction SilentlyContinue
    $taskPath = Join-Path $guestRoot 'task.json'
    $Task | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $taskPath -Encoding UTF8
    if (-not (Test-Path -LiteralPath $taskPath)) { throw 'isolated_guest_task_stage_failed' }
    return @{
      guestAgentVersionMarkerPresent = [bool]((Get-Content -LiteralPath $guestAgent -Raw -Encoding UTF8) -match "\$GuestAgentVersion\s*=\s*'1\.2\.0'")
      taskStaged = $true
    }
  } finally {
    Dismount-EkodiGuestWindowsVolume $VhdPath
  }
}

function Read-EkodiGuestRuntimeReceipt([string]$VhdPath) {
  $mount = Mount-EkodiGuestWindowsVolume $VhdPath
  try {
    $receiptPath = Join-Path $mount.root 'ProgramData\EKODI\GuestAgent\receipt.json'
    if (-not (Test-Path -LiteralPath $receiptPath)) { throw 'isolated_guest_receipt_missing' }
    $raw = Get-Content -LiteralPath $receiptPath -Raw -Encoding UTF8
    if (-not $raw) { throw 'isolated_guest_receipt_empty' }
    return @{ raw = $raw; receipt = ($raw | ConvertFrom-Json) }
  } finally {
    Dismount-EkodiGuestWindowsVolume $VhdPath
  }
}

function Get-IsolatedDesktopGuestCanaryState {
  if (-not (Test-Path -LiteralPath $IsolatedDesktopGuestCanaryStatePath)) {
    return @{ verified = $false; checkedAt = ''; agentVersion = $AgentVersion; guestAgentVersion = '1.2.0' }
  }
  try {
    $state = Get-Content -LiteralPath $IsolatedDesktopGuestCanaryStatePath -Raw -Encoding UTF8 | ConvertFrom-Json
    $verified = (
      $state.ok -eq $true -and
      [string]$state.agentVersion -eq $AgentVersion -and
      [string]$state.guestAgentVersion -eq '1.2.0' -and
      [string]$state.mode -eq 'isolated-desktop-guest-runtime-canary' -and
      $state.executedAsSystem -eq $true -and
      $state.noNetworkAdapter -eq $true -and
      $state.noActiveNetwork -eq $true -and
      $state.interactiveDesktopUsed -eq $false -and
      $state.sharedInteractiveDesktop -eq $false -and
      $state.clipboardShared -eq $false -and
      $state.userInputInjection -eq $false -and
      $state.credentialCollection -eq $false -and
      $state.sessionVmRemoved -eq $true -and
      $state.sessionDiskRemoved -eq $true
    )
    return @{
      verified = [bool]$verified
      checkedAt = [string]$state.checkedAt
      agentVersion = [string]$state.agentVersion
      guestAgentVersion = [string]$state.guestAgentVersion
      receiptSha256 = [string]$state.receiptSha256
    }
  } catch {
    return @{ verified = $false; checkedAt = ''; agentVersion = $AgentVersion; guestAgentVersion = '1.2.0'; error = 'isolated_guest_canary_state_invalid' }
  }
}

function Invoke-IsolatedDesktopGuestRuntimeCanary {
  Remove-Item -LiteralPath $IsolatedDesktopGuestCanaryStatePath -Force -ErrorAction SilentlyContinue
  $desktopCanary = Get-IsolatedDesktopCanaryState
  if (-not $desktopCanary.verified) { throw 'isolated_desktop_hyperv_canary_required' }

  $probe = Get-IsolatedDesktopBackendProbe
  if (-not $probe.headlessBackendReady -or $probe.recommendedBackend -ne 'hyper-v-ekodi-base') {
    throw "isolated_guest_backend_not_ready:$($probe.gapReason)"
  }

  $baseVmName = 'EKODI-Isolated-Base'
  $baseVm = Get-VM -Name $baseVmName -ErrorAction Stop
  if ([string]$baseVm.State -ne 'Off') { throw 'isolated_guest_base_vm_must_be_off' }
  $baseDisks = @(Get-VMHardDiskDrive -VMName $baseVmName -ErrorAction Stop)
  if ($baseDisks.Count -ne 1) { throw 'isolated_guest_base_vm_requires_single_disk' }
  $baseDiskPath = [string]$baseDisks[0].Path
  if (-not $baseDiskPath -or -not (Test-Path -LiteralPath $baseDiskPath)) { throw 'isolated_guest_base_disk_missing' }

  New-Item -ItemType Directory -Path $IsolatedDesktopSessionRoot -Force | Out-Null
  $sessionId = [guid]::NewGuid().ToString('N')
  $sessionName = "EKODI-Guest-$sessionId"
  $sessionDir = Join-Path $IsolatedDesktopSessionRoot $sessionId
  $sessionDisk = Join-Path $sessionDir 'guest-session.vhdx'
  New-Item -ItemType Directory -Path $sessionDir -Force | Out-Null

  $taskId = [guid]::NewGuid().ToString('N')
  $nonce = New-EkodiNonceHex 32
  $expiresAt = [DateTime]::UtcNow.AddMinutes(10).ToString('o')
  $task = @{
    schemaVersion = 1
    type = 'guest.runtime.probe'
    taskId = $taskId
    nonce = $nonce
    networkPolicy = 'none'
    expiresAt = $expiresAt
  }
  $expectedNonceSha = Get-Sha256String $nonce

  $vmCreated = $false
  $receiptEvidence = $null
  $proof = $null
  try {
    New-VHD -Path $sessionDisk -ParentPath $baseDiskPath -Differencing -ErrorAction Stop | Out-Null
    $staging = Write-EkodiGuestRuntimeTask $sessionDisk $task
    if (-not $staging.taskStaged -or -not $staging.guestAgentVersionMarkerPresent) {
      throw 'isolated_guest_agent_version_not_verified'
    }

    $vm = New-VM -Name $sessionName -Generation ([int]$baseVm.Generation) -MemoryStartupBytes 2GB -VHDPath $sessionDisk -ErrorAction Stop
    $vmCreated = $true
    Get-VMNetworkAdapter -VMName $sessionName -ErrorAction SilentlyContinue | Remove-VMNetworkAdapter -ErrorAction SilentlyContinue
    Set-VM -Name $sessionName -AutomaticStartAction Nothing -AutomaticStopAction TurnOff -AutomaticCheckpointsEnabled $false -ErrorAction Stop
    if ([int]$baseVm.Generation -eq 2) { Set-VMFirmware -VMName $sessionName -EnableSecureBoot On -ErrorAction Stop }

    Start-VM -Name $sessionName -ErrorAction Stop | Out-Null
    $bootDeadline = [DateTime]::UtcNow.AddSeconds(50)
    $runningObserved = $false
    $heartbeatObserved = $false
    do {
      Start-Sleep -Milliseconds 1000
      $vmState = [string](Get-VM -Name $sessionName -ErrorAction Stop).State
      if ($vmState -eq 'Running') { $runningObserved = $true }
      try {
        $heartbeat = Get-VMIntegrationService -VMName $sessionName -Name 'Heartbeat' -ErrorAction Stop
        if ([string]$heartbeat.PrimaryStatusDescription -match '(?i)OK') { $heartbeatObserved = $true; break }
      } catch { }
    } while ([DateTime]::UtcNow -lt $bootDeadline)
    if (-not $runningObserved) { throw 'isolated_guest_vm_never_running' }
    if (-not $heartbeatObserved) { throw 'isolated_guest_heartbeat_timeout' }

    Start-Sleep -Seconds 8
    Stop-VM -Name $sessionName -TurnOff -Force -ErrorAction Stop
    $receiptEvidence = Read-EkodiGuestRuntimeReceipt $sessionDisk
    $receipt = $receiptEvidence.receipt

    $receiptOk = (
      $receipt.ok -eq $true -and
      [string]$receipt.mode -eq 'ekodi-isolated-guest-runtime-canary' -and
      [string]$receipt.guestAgentVersion -eq '1.2.0' -and
      [string]$receipt.taskType -eq 'guest.runtime.probe' -and
      [string]$receipt.taskId -eq $taskId -and
      [string]$receipt.nonceSha256 -eq $expectedNonceSha -and
      $receipt.executedAsSystem -eq $true -and
      $receipt.noNetworkAdapter -eq $true -and
      $receipt.noActiveNetwork -eq $true -and
      $receipt.interactiveDesktopUsed -eq $false -and
      $receipt.sharedInteractiveDesktop -eq $false -and
      $receipt.clipboardShared -eq $false -and
      $receipt.userInputInjection -eq $false -and
      $receipt.credentialCollection -eq $false -and
      [string]$receipt.mutationScope -eq 'ephemeral-guest-only'
    )
    if (-not $receiptOk) { throw 'isolated_guest_receipt_contract_failed' }

    $proof = @{
      ok = $true
      mode = 'isolated-desktop-guest-runtime-canary'
      provider = 'ekodi-native-remote-computer'
      routingPolicy = 'EKODI-VIRTUALIZATION-ROUTING-001'
      backendPolicy = 'EKODI-ISOLATED-DESKTOP-BACKEND-001'
      agentVersion = $AgentVersion
      guestAgentVersion = [string]$receipt.guestAgentVersion
      backend = 'hyper-v-ekodi-base'
      sessionType = 'vm'
      sessionId = $sessionId
      taskId = $taskId
      taskType = 'guest.runtime.probe'
      receiptSha256 = Get-Sha256String ([string]$receiptEvidence.raw)
      executedAsSystem = [bool]$receipt.executedAsSystem
      guestSessionId = [int]$receipt.sessionId
      noNetworkAdapter = [bool]$receipt.noNetworkAdapter
      noActiveNetwork = [bool]$receipt.noActiveNetwork
      interactiveDesktopUsed = [bool]$receipt.interactiveDesktopUsed
      sharedInteractiveDesktop = [bool]$receipt.sharedInteractiveDesktop
      clipboardShared = [bool]$receipt.clipboardShared
      userInputInjection = [bool]$receipt.userInputInjection
      credentialCollection = [bool]$receipt.credentialCollection
      hostProfileMounted = [bool]$receipt.hostProfileMounted
      mutationScope = [string]$receipt.mutationScope
      vmReachedRunning = [bool]$runningObserved
      heartbeatObserved = [bool]$heartbeatObserved
      networkAttached = $false
      ephemeralDifferencingDisk = $true
      baseDiskWriteForbidden = $true
      sessionVmRemoved = $false
      sessionDiskRemoved = $false
      checkedAt = (Get-Date).ToUniversalTime().ToString('o')
    }
  } finally {
    if ($vmCreated) {
      try {
        $existing = Get-VM -Name $sessionName -ErrorAction SilentlyContinue
        if ($existing -and [string]$existing.State -ne 'Off') { Stop-VM -Name $sessionName -TurnOff -Force -ErrorAction SilentlyContinue }
      } catch { }
      try { Remove-VM -Name $sessionName -Force -ErrorAction SilentlyContinue } catch { }
    }
    Remove-Item -LiteralPath $sessionDir -Recurse -Force -ErrorAction SilentlyContinue
    if ($proof) {
      $proof.sessionVmRemoved = -not [bool](Get-VM -Name $sessionName -ErrorAction SilentlyContinue)
      $proof.sessionDiskRemoved = -not (Test-Path -LiteralPath $sessionDisk)
    }
  }

  if (-not $proof -or -not $proof.sessionVmRemoved -or -not $proof.sessionDiskRemoved) {
    throw 'isolated_guest_canary_cleanup_failed'
  }
  New-Item -ItemType Directory -Path $Root -Force | Out-Null
  $proof | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $IsolatedDesktopGuestCanaryStatePath -Encoding UTF8
  return @{
    message = 'EKODI Guest Agent가 네트워크 없는 임시 Hyper-V VM 내부에서 실제 작업을 수행하고 영수증을 반환했습니다. 실제 GUI 입력 실행은 아직 비활성입니다.'
    desktopGuestCanary = $proof
  }
}

function Get-IsolatedDesktopUiCanaryState {
  if (-not (Test-Path -LiteralPath $IsolatedDesktopUiCanaryStatePath)) {
    return @{ verified = $false; checkedAt = ''; agentVersion = $AgentVersion; guestAgentVersion = '1.2.0' }
  }
  try {
    $state = Get-Content -LiteralPath $IsolatedDesktopUiCanaryStatePath -Raw -Encoding UTF8 | ConvertFrom-Json
    $verified = (
      $state.ok -eq $true -and
      [string]$state.agentVersion -eq $AgentVersion -and
      [string]$state.guestAgentVersion -eq '1.2.0' -and
      [string]$state.mode -eq 'isolated-desktop-guest-ui-canary' -and
      $state.executedAsSystem -eq $true -and
      $state.noNetworkAdapter -eq $true -and
      $state.noActiveNetwork -eq $true -and
      $state.guestUiSurfaceUsed -eq $true -and
      $state.hostInteractiveDesktopUsed -eq $false -and
      $state.sharedInteractiveDesktop -eq $false -and
      $state.semanticUiAutomation -eq $true -and
      $state.lowLevelInputInjection -eq $false -and
      $state.clipboardShared -eq $false -and
      $state.credentialCollection -eq $false -and
      $state.syntheticUiOnly -eq $true -and
      $state.windowFound -eq $true -and
      $state.buttonFound -eq $true -and
      $state.invokePatternAvailable -eq $true -and
      $state.controlInvoked -eq $true -and
      [string]$state.resultCode -eq 'EKODI_UI_OK' -and
      $state.windowClosed -eq $true -and
      $state.sessionVmRemoved -eq $true -and
      $state.sessionDiskRemoved -eq $true
    )
    return @{
      verified = [bool]$verified
      checkedAt = [string]$state.checkedAt
      agentVersion = [string]$state.agentVersion
      guestAgentVersion = [string]$state.guestAgentVersion
      receiptSha256 = [string]$state.receiptSha256
      semanticUiAutomation = [bool]$state.semanticUiAutomation
      controlInvoked = [bool]$state.controlInvoked
    }
  } catch {
    return @{ verified = $false; checkedAt = ''; agentVersion = $AgentVersion; guestAgentVersion = '1.2.0'; error = 'isolated_ui_canary_state_invalid' }
  }
}

function Invoke-IsolatedDesktopGuestUiCanary {
  Remove-Item -LiteralPath $IsolatedDesktopUiCanaryStatePath -Force -ErrorAction SilentlyContinue
  $runtimeCanary = Get-IsolatedDesktopGuestCanaryState
  if (-not $runtimeCanary.verified) { throw 'isolated_guest_runtime_canary_required' }

  $probe = Get-IsolatedDesktopBackendProbe
  if (-not $probe.headlessBackendReady -or $probe.recommendedBackend -ne 'hyper-v-ekodi-base') {
    throw "isolated_ui_backend_not_ready:$($probe.gapReason)"
  }

  $baseVmName = 'EKODI-Isolated-Base'
  $baseVm = Get-VM -Name $baseVmName -ErrorAction Stop
  if ([string]$baseVm.State -ne 'Off') { throw 'isolated_ui_base_vm_must_be_off' }
  $baseDisks = @(Get-VMHardDiskDrive -VMName $baseVmName -ErrorAction Stop)
  if ($baseDisks.Count -ne 1) { throw 'isolated_ui_base_vm_requires_single_disk' }
  $baseDiskPath = [string]$baseDisks[0].Path
  if (-not $baseDiskPath -or -not (Test-Path -LiteralPath $baseDiskPath)) { throw 'isolated_ui_base_disk_missing' }

  New-Item -ItemType Directory -Path $IsolatedDesktopSessionRoot -Force | Out-Null
  $sessionId = [guid]::NewGuid().ToString('N')
  $sessionName = "EKODI-UI-$sessionId"
  $sessionDir = Join-Path $IsolatedDesktopSessionRoot $sessionId
  $sessionDisk = Join-Path $sessionDir 'ui-session.vhdx'
  New-Item -ItemType Directory -Path $sessionDir -Force | Out-Null

  $taskId = [guid]::NewGuid().ToString('N')
  $nonce = New-EkodiNonceHex 32
  $task = @{
    schemaVersion = 1
    type = 'guest.ui.probe'
    taskId = $taskId
    nonce = $nonce
    networkPolicy = 'none'
    expiresAt = [DateTime]::UtcNow.AddMinutes(10).ToString('o')
  }
  $expectedNonceSha = Get-Sha256String $nonce

  $vmCreated = $false
  $proof = $null
  try {
    New-VHD -Path $sessionDisk -ParentPath $baseDiskPath -Differencing -ErrorAction Stop | Out-Null
    $staging = Write-EkodiGuestRuntimeTask $sessionDisk $task
    if (-not $staging.taskStaged -or -not $staging.guestAgentVersionMarkerPresent) { throw 'isolated_ui_guest_agent_version_not_verified' }

    $vm = New-VM -Name $sessionName -Generation ([int]$baseVm.Generation) -MemoryStartupBytes 2GB -VHDPath $sessionDisk -ErrorAction Stop
    $vmCreated = $true
    Get-VMNetworkAdapter -VMName $sessionName -ErrorAction SilentlyContinue | Remove-VMNetworkAdapter -ErrorAction SilentlyContinue
    Set-VM -Name $sessionName -AutomaticStartAction Nothing -AutomaticStopAction TurnOff -AutomaticCheckpointsEnabled $false -ErrorAction Stop
    if ([int]$baseVm.Generation -eq 2) { Set-VMFirmware -VMName $sessionName -EnableSecureBoot On -ErrorAction Stop }

    Start-VM -Name $sessionName -ErrorAction Stop | Out-Null
    $deadline = [DateTime]::UtcNow.AddSeconds(55)
    $runningObserved = $false
    $heartbeatObserved = $false
    do {
      Start-Sleep -Milliseconds 1000
      $vmState = [string](Get-VM -Name $sessionName -ErrorAction Stop).State
      if ($vmState -eq 'Running') { $runningObserved = $true }
      try {
        $heartbeat = Get-VMIntegrationService -VMName $sessionName -Name 'Heartbeat' -ErrorAction Stop
        if ([string]$heartbeat.PrimaryStatusDescription -match '(?i)OK') { $heartbeatObserved = $true; break }
      } catch { }
    } while ([DateTime]::UtcNow -lt $deadline)
    if (-not $runningObserved) { throw 'isolated_ui_vm_never_running' }
    if (-not $heartbeatObserved) { throw 'isolated_ui_heartbeat_timeout' }

    Start-Sleep -Seconds 10
    Stop-VM -Name $sessionName -TurnOff -Force -ErrorAction Stop
    $receiptEvidence = Read-EkodiGuestRuntimeReceipt $sessionDisk
    $receipt = $receiptEvidence.receipt

    $receiptOk = (
      $receipt.ok -eq $true -and
      [string]$receipt.mode -eq 'ekodi-isolated-guest-ui-canary' -and
      [string]$receipt.guestAgentVersion -eq '1.2.0' -and
      [string]$receipt.taskType -eq 'guest.ui.probe' -and
      [string]$receipt.taskId -eq $taskId -and
      [string]$receipt.nonceSha256 -eq $expectedNonceSha -and
      $receipt.executedAsSystem -eq $true -and
      $receipt.noNetworkAdapter -eq $true -and
      $receipt.noActiveNetwork -eq $true -and
      $receipt.guestUiSurfaceUsed -eq $true -and
      $receipt.hostInteractiveDesktopUsed -eq $false -and
      $receipt.sharedInteractiveDesktop -eq $false -and
      $receipt.semanticUiAutomation -eq $true -and
      $receipt.lowLevelInputInjection -eq $false -and
      $receipt.clipboardShared -eq $false -and
      $receipt.credentialCollection -eq $false -and
      $receipt.hostProfileMounted -eq $false -and
      $receipt.syntheticUiOnly -eq $true -and
      $receipt.windowHandleObserved -eq $true -and
      $receipt.windowFound -eq $true -and
      $receipt.buttonFound -eq $true -and
      $receipt.invokePatternAvailable -eq $true -and
      $receipt.controlInvoked -eq $true -and
      [string]$receipt.resultCode -eq 'EKODI_UI_OK' -and
      $receipt.windowClosed -eq $true -and
      [string]$receipt.mutationScope -eq 'ephemeral-guest-ui-only'
    )
    if (-not $receiptOk) { throw 'isolated_ui_receipt_contract_failed' }

    $proof = @{
      ok = $true
      mode = 'isolated-desktop-guest-ui-canary'
      provider = 'ekodi-native-remote-computer'
      routingPolicy = 'EKODI-VIRTUALIZATION-ROUTING-001'
      backendPolicy = 'EKODI-ISOLATED-DESKTOP-BACKEND-001'
      agentVersion = $AgentVersion
      guestAgentVersion = [string]$receipt.guestAgentVersion
      backend = 'hyper-v-ekodi-base'
      sessionType = 'vm'
      sessionId = $sessionId
      taskId = $taskId
      taskType = 'guest.ui.probe'
      receiptSha256 = Get-Sha256String ([string]$receiptEvidence.raw)
      executedAsSystem = [bool]$receipt.executedAsSystem
      noNetworkAdapter = [bool]$receipt.noNetworkAdapter
      noActiveNetwork = [bool]$receipt.noActiveNetwork
      guestUiSurfaceUsed = [bool]$receipt.guestUiSurfaceUsed
      hostInteractiveDesktopUsed = [bool]$receipt.hostInteractiveDesktopUsed
      sharedInteractiveDesktop = [bool]$receipt.sharedInteractiveDesktop
      semanticUiAutomation = [bool]$receipt.semanticUiAutomation
      lowLevelInputInjection = [bool]$receipt.lowLevelInputInjection
      clipboardShared = [bool]$receipt.clipboardShared
      credentialCollection = [bool]$receipt.credentialCollection
      hostProfileMounted = [bool]$receipt.hostProfileMounted
      syntheticUiOnly = [bool]$receipt.syntheticUiOnly
      windowHandleObserved = [bool]$receipt.windowHandleObserved
      windowFound = [bool]$receipt.windowFound
      buttonFound = [bool]$receipt.buttonFound
      invokePatternAvailable = [bool]$receipt.invokePatternAvailable
      controlInvoked = [bool]$receipt.controlInvoked
      resultCode = [string]$receipt.resultCode
      windowClosed = [bool]$receipt.windowClosed
      mutationScope = [string]$receipt.mutationScope
      vmReachedRunning = [bool]$runningObserved
      heartbeatObserved = [bool]$heartbeatObserved
      networkAttached = $false
      ephemeralDifferencingDisk = $true
      baseDiskWriteForbidden = $true
      sessionVmRemoved = $false
      sessionDiskRemoved = $false
      checkedAt = (Get-Date).ToUniversalTime().ToString('o')
    }
  } finally {
    if ($vmCreated) {
      try {
        $existing = Get-VM -Name $sessionName -ErrorAction SilentlyContinue
        if ($existing -and [string]$existing.State -ne 'Off') { Stop-VM -Name $sessionName -TurnOff -Force -ErrorAction SilentlyContinue }
      } catch { }
      try { Remove-VM -Name $sessionName -Force -ErrorAction SilentlyContinue } catch { }
    }
    Remove-Item -LiteralPath $sessionDir -Recurse -Force -ErrorAction SilentlyContinue
    if ($proof) {
      $proof.sessionVmRemoved = -not [bool](Get-VM -Name $sessionName -ErrorAction SilentlyContinue)
      $proof.sessionDiskRemoved = -not (Test-Path -LiteralPath $sessionDisk)
    }
  }

  if (-not $proof -or -not $proof.sessionVmRemoved -or -not $proof.sessionDiskRemoved) { throw 'isolated_ui_canary_cleanup_failed' }
  New-Item -ItemType Directory -Path $Root -Force | Out-Null
  $proof | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $IsolatedDesktopUiCanaryStatePath -Encoding UTF8
  return @{
    message = 'EKODI 자체 임시 Hyper-V Guest에서 의미 기반 UI Automation으로 독립 GUI 제어 canary를 완료했습니다. 실제 사용자 데스크톱에는 접근하지 않았습니다.'
    desktopUiCanary = $proof
  }
}

function Get-IsolatedDesktopSessionCanaryState {
  if (-not (Test-Path -LiteralPath $IsolatedDesktopSessionCanaryStatePath)) {
    return @{ verified = $false; checkedAt = ''; agentVersion = $AgentVersion; guestAgentVersion = '1.2.0' }
  }
  try {
    $state = Get-Content -LiteralPath $IsolatedDesktopSessionCanaryStatePath -Raw -Encoding UTF8 | ConvertFrom-Json
    $verified = (
      $state.ok -eq $true -and
      [string]$state.agentVersion -eq $AgentVersion -and
      [string]$state.guestAgentVersion -eq '1.2.0' -and
      [string]$state.mode -eq 'isolated-desktop-session-canary' -and
      [string]$state.operation -eq 'ui.text.roundtrip' -and
      $state.executedAsSystem -eq $true -and
      $state.noNetworkAdapter -eq $true -and
      $state.noActiveNetwork -eq $true -and
      $state.hostInteractiveDesktopUsed -eq $false -and
      $state.sharedInteractiveDesktop -eq $false -and
      $state.semanticUiAutomation -eq $true -and
      $state.lowLevelInputInjection -eq $false -and
      $state.clipboardShared -eq $false -and
      $state.credentialCollection -eq $false -and
      $state.hostProfileMounted -eq $false -and
      $state.valuePatternAvailable -eq $true -and
      $state.invokePatternAvailable -eq $true -and
      $state.valueSet -eq $true -and
      $state.controlInvoked -eq $true -and
      $state.roundTripMatched -eq $true -and
      [string]$state.resultCode -eq 'EKODI_SESSION_OK' -and
      $state.windowClosed -eq $true -and
      $state.sessionVmRemoved -eq $true -and
      $state.sessionDiskRemoved -eq $true
    )
    return @{
      verified = [bool]$verified
      checkedAt = [string]$state.checkedAt
      agentVersion = [string]$state.agentVersion
      guestAgentVersion = [string]$state.guestAgentVersion
      receiptSha256 = [string]$state.receiptSha256
      operation = [string]$state.operation
      roundTripMatched = [bool]$state.roundTripMatched
    }
  } catch {
    return @{ verified = $false; checkedAt = ''; agentVersion = $AgentVersion; guestAgentVersion = '1.2.0'; error = 'isolated_session_canary_state_invalid' }
  }
}

function Test-EkodiBoundedSessionText([string]$Text) {
  return [bool]($Text -match '^EKODI_SESSION_[A-Z0-9_-]{8,64}$')
}

function Invoke-IsolatedDesktopBoundedSessionTask($Payload, [bool]$IsCanary = $false) {
  $uiCanary = Get-IsolatedDesktopUiCanaryState
  if (-not $uiCanary.verified) { throw 'isolated_ui_canary_required' }
  if (-not $IsCanary) {
    $sessionCanary = Get-IsolatedDesktopSessionCanaryState
    if (-not $sessionCanary.verified) { throw 'isolated_session_canary_required' }
  }

  $operation = 'ui.text.roundtrip'
  if ($IsCanary) {
    $sessionText = "EKODI_SESSION_CANARY_$(([guid]::NewGuid().ToString('N').Substring(0,16)).ToUpperInvariant())"
  } else {
    $operation = [string]$Payload.operation
    $sessionText = [string]$Payload.text
  }
  if ($operation -ne 'ui.text.roundtrip') { throw 'isolated_session_operation_forbidden' }
  if (-not (Test-EkodiBoundedSessionText $sessionText)) { throw 'isolated_session_text_invalid' }

  $probe = Get-IsolatedDesktopBackendProbe
  if (-not $probe.headlessBackendReady -or $probe.recommendedBackend -ne 'hyper-v-ekodi-base') {
    throw "isolated_session_backend_not_ready:$($probe.gapReason)"
  }

  $baseVmName = 'EKODI-Isolated-Base'
  $baseVm = Get-VM -Name $baseVmName -ErrorAction Stop
  if ([string]$baseVm.State -ne 'Off') { throw 'isolated_session_base_vm_must_be_off' }
  $baseDisks = @(Get-VMHardDiskDrive -VMName $baseVmName -ErrorAction Stop)
  if ($baseDisks.Count -ne 1) { throw 'isolated_session_base_vm_requires_single_disk' }
  $baseDiskPath = [string]$baseDisks[0].Path
  if (-not $baseDiskPath -or -not (Test-Path -LiteralPath $baseDiskPath)) { throw 'isolated_session_base_disk_missing' }

  New-Item -ItemType Directory -Path $IsolatedDesktopSessionRoot -Force | Out-Null
  $sessionId = [guid]::NewGuid().ToString('N')
  $sessionName = "EKODI-Session-$sessionId"
  $sessionDir = Join-Path $IsolatedDesktopSessionRoot $sessionId
  $sessionDisk = Join-Path $sessionDir 'bounded-session.vhdx'
  New-Item -ItemType Directory -Path $sessionDir -Force | Out-Null

  $taskId = [guid]::NewGuid().ToString('N')
  $nonce = New-EkodiNonceHex 32
  $task = @{
    schemaVersion = 1
    type = 'guest.session.execute'
    taskId = $taskId
    nonce = $nonce
    networkPolicy = 'none'
    operation = $operation
    text = $sessionText
    expiresAt = [DateTime]::UtcNow.AddMinutes(10).ToString('o')
  }
  $expectedNonceSha = Get-Sha256String $nonce
  $expectedTextSha = Get-Sha256String $sessionText

  $vmCreated = $false
  $proof = $null
  try {
    New-VHD -Path $sessionDisk -ParentPath $baseDiskPath -Differencing -ErrorAction Stop | Out-Null
    $staging = Write-EkodiGuestRuntimeTask $sessionDisk $task
    if (-not $staging.taskStaged -or -not $staging.guestAgentVersionMarkerPresent) { throw 'isolated_session_guest_agent_version_not_verified' }

    $vm = New-VM -Name $sessionName -Generation ([int]$baseVm.Generation) -MemoryStartupBytes 2GB -VHDPath $sessionDisk -ErrorAction Stop
    $vmCreated = $true
    Get-VMNetworkAdapter -VMName $sessionName -ErrorAction SilentlyContinue | Remove-VMNetworkAdapter -ErrorAction SilentlyContinue
    Set-VM -Name $sessionName -AutomaticStartAction Nothing -AutomaticStopAction TurnOff -AutomaticCheckpointsEnabled $false -ErrorAction Stop
    if ([int]$baseVm.Generation -eq 2) { Set-VMFirmware -VMName $sessionName -EnableSecureBoot On -ErrorAction Stop }

    Start-VM -Name $sessionName -ErrorAction Stop | Out-Null
    $deadline = [DateTime]::UtcNow.AddSeconds(55)
    $runningObserved = $false
    $heartbeatObserved = $false
    do {
      Start-Sleep -Milliseconds 1000
      $vmState = [string](Get-VM -Name $sessionName -ErrorAction Stop).State
      if ($vmState -eq 'Running') { $runningObserved = $true }
      try {
        $heartbeat = Get-VMIntegrationService -VMName $sessionName -Name 'Heartbeat' -ErrorAction Stop
        if ([string]$heartbeat.PrimaryStatusDescription -match '(?i)OK') { $heartbeatObserved = $true; break }
      } catch { }
    } while ([DateTime]::UtcNow -lt $deadline)
    if (-not $runningObserved) { throw 'isolated_session_vm_never_running' }
    if (-not $heartbeatObserved) { throw 'isolated_session_heartbeat_timeout' }

    Start-Sleep -Seconds 10
    Stop-VM -Name $sessionName -TurnOff -Force -ErrorAction Stop
    $receiptEvidence = Read-EkodiGuestRuntimeReceipt $sessionDisk
    $receipt = $receiptEvidence.receipt

    $receiptOk = (
      $receipt.ok -eq $true -and
      [string]$receipt.mode -eq 'ekodi-isolated-guest-session-execution' -and
      [string]$receipt.guestAgentVersion -eq '1.2.0' -and
      [string]$receipt.taskType -eq 'guest.session.execute' -and
      [string]$receipt.taskId -eq $taskId -and
      [string]$receipt.operation -eq $operation -and
      [string]$receipt.nonceSha256 -eq $expectedNonceSha -and
      $receipt.executedAsSystem -eq $true -and
      $receipt.noNetworkAdapter -eq $true -and
      $receipt.noActiveNetwork -eq $true -and
      $receipt.guestUiSurfaceUsed -eq $true -and
      $receipt.hostInteractiveDesktopUsed -eq $false -and
      $receipt.sharedInteractiveDesktop -eq $false -and
      $receipt.semanticUiAutomation -eq $true -and
      $receipt.lowLevelInputInjection -eq $false -and
      $receipt.clipboardShared -eq $false -and
      $receipt.credentialCollection -eq $false -and
      $receipt.hostProfileMounted -eq $false -and
      $receipt.valuePatternAvailable -eq $true -and
      $receipt.invokePatternAvailable -eq $true -and
      $receipt.valueSet -eq $true -and
      $receipt.controlInvoked -eq $true -and
      $receipt.roundTripMatched -eq $true -and
      [string]$receipt.inputSha256 -eq $expectedTextSha -and
      [string]$receipt.outputSha256 -eq $expectedTextSha -and
      [int]$receipt.textLength -eq $sessionText.Length -and
      [string]$receipt.resultCode -eq 'EKODI_SESSION_OK' -and
      $receipt.windowClosed -eq $true -and
      [string]$receipt.mutationScope -eq 'ephemeral-guest-session-only'
    )
    if (-not $receiptOk) { throw 'isolated_session_receipt_contract_failed' }

    $proof = @{
      ok = $true
      mode = $(if ($IsCanary) { 'isolated-desktop-session-canary' } else { 'isolated-desktop-session-execution' })
      provider = 'ekodi-native-remote-computer'
      routingPolicy = 'EKODI-VIRTUALIZATION-ROUTING-001'
      backendPolicy = 'EKODI-ISOLATED-DESKTOP-BACKEND-001'
      agentVersion = $AgentVersion
      guestAgentVersion = [string]$receipt.guestAgentVersion
      executorVersion = 'bounded-v1'
      backend = 'hyper-v-ekodi-base'
      sessionType = 'vm'
      sessionId = $sessionId
      taskId = $taskId
      taskType = 'guest.session.execute'
      operation = $operation
      receiptSha256 = Get-Sha256String ([string]$receiptEvidence.raw)
      inputSha256 = [string]$receipt.inputSha256
      outputSha256 = [string]$receipt.outputSha256
      textLength = [int]$receipt.textLength
      executedAsSystem = [bool]$receipt.executedAsSystem
      noNetworkAdapter = [bool]$receipt.noNetworkAdapter
      noActiveNetwork = [bool]$receipt.noActiveNetwork
      guestUiSurfaceUsed = [bool]$receipt.guestUiSurfaceUsed
      hostInteractiveDesktopUsed = [bool]$receipt.hostInteractiveDesktopUsed
      sharedInteractiveDesktop = [bool]$receipt.sharedInteractiveDesktop
      semanticUiAutomation = [bool]$receipt.semanticUiAutomation
      lowLevelInputInjection = [bool]$receipt.lowLevelInputInjection
      clipboardShared = [bool]$receipt.clipboardShared
      credentialCollection = [bool]$receipt.credentialCollection
      hostProfileMounted = [bool]$receipt.hostProfileMounted
      valuePatternAvailable = [bool]$receipt.valuePatternAvailable
      invokePatternAvailable = [bool]$receipt.invokePatternAvailable
      valueSet = [bool]$receipt.valueSet
      controlInvoked = [bool]$receipt.controlInvoked
      roundTripMatched = [bool]$receipt.roundTripMatched
      resultCode = [string]$receipt.resultCode
      windowClosed = [bool]$receipt.windowClosed
      mutationScope = [string]$receipt.mutationScope
      vmReachedRunning = [bool]$runningObserved
      heartbeatObserved = [bool]$heartbeatObserved
      networkAttached = $false
      ephemeralDifferencingDisk = $true
      baseDiskWriteForbidden = $true
      sessionVmRemoved = $false
      sessionDiskRemoved = $false
      checkedAt = (Get-Date).ToUniversalTime().ToString('o')
    }
  } finally {
    if ($vmCreated) {
      try {
        $existing = Get-VM -Name $sessionName -ErrorAction SilentlyContinue
        if ($existing -and [string]$existing.State -ne 'Off') { Stop-VM -Name $sessionName -TurnOff -Force -ErrorAction SilentlyContinue }
      } catch { }
      try { Remove-VM -Name $sessionName -Force -ErrorAction SilentlyContinue } catch { }
    }
    Remove-Item -LiteralPath $sessionDir -Recurse -Force -ErrorAction SilentlyContinue
    if ($proof) {
      $proof.sessionVmRemoved = -not [bool](Get-VM -Name $sessionName -ErrorAction SilentlyContinue)
      $proof.sessionDiskRemoved = -not (Test-Path -LiteralPath $sessionDisk)
    }
  }

  if (-not $proof -or -not $proof.sessionVmRemoved -or -not $proof.sessionDiskRemoved) { throw 'isolated_session_cleanup_failed' }
  return $proof
}

function Invoke-IsolatedDesktopSessionCanary {
  Remove-Item -LiteralPath $IsolatedDesktopSessionCanaryStatePath -Force -ErrorAction SilentlyContinue
  $proof = Invoke-IsolatedDesktopBoundedSessionTask $null $true
  New-Item -ItemType Directory -Path $Root -Force | Out-Null
  $proof | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $IsolatedDesktopSessionCanaryStatePath -Encoding UTF8
  return @{
    message = 'EKODI 자체 격리 Guest의 bounded-v1 세션 executor canary를 완료했습니다. 이후에도 허용된 작업 스키마만 실행합니다.'
    desktopSessionCanary = $proof
  }
}

function Invoke-IsolatedDesktopSessionExecute($Payload) {
  $proof = Invoke-IsolatedDesktopBoundedSessionTask $Payload $false
  return @{
    message = 'EKODI 자체 격리 Guest에서 bounded-v1 세션 작업을 완료했습니다. 원문 입력은 클라우드 결과에 반환하지 않습니다.'
    desktopSession = $proof
  }
}

function Get-RemoteAgentStatus {
  $taskState = 'unknown'
  try {
    $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
    $taskState = [string]$task.State
  } catch { }
  return @{
    checkedAt = (Get-Date).ToUniversalTime().ToString('o')
    version = $AgentVersion
    hostname = $env:COMPUTERNAME
    processId = $PID
    taskName = $TaskName
    taskState = $taskState
    persistentShell = $false
    directHostMutation = $false
    foregroundUserSessionProtected = $true
    backgroundBrowserCanaryVerified = [bool](Get-BackgroundBrowserCanaryState).verified
    backgroundBrowserReady = [bool](Get-BackgroundBrowserCanaryState).verified
    isolatedDesktopProbeAvailable = $true
    isolatedDesktopCanaryVerified = [bool](Get-IsolatedDesktopCanaryState).verified
    isolatedDesktopGuestCanaryVerified = [bool](Get-IsolatedDesktopGuestCanaryState).verified
    isolatedDesktopUiCanaryVerified = [bool](Get-IsolatedDesktopUiCanaryState).verified
    isolatedDesktopSessionCanaryVerified = [bool](Get-IsolatedDesktopSessionCanaryState).verified
    isolatedDesktopReady = [bool](Get-IsolatedDesktopSessionCanaryState).verified
    minimizedWindowCountsAsIsolation = $false
  }
}

function Get-FullDiagnostic {
  return @{
    generatedAt = (Get-Date).ToUniversalTime().ToString('o')
    system = Get-SystemSnapshot
    storage = Get-StorageSnapshot
    network = Get-NetworkDiagnostic
    printers = Get-PrinterDiagnostic
    startup = Get-StartupDiagnostic
    updates = Get-WindowsUpdateDiagnostic
  }
}

function Get-ImagePrintPreviewPolicyState {
  if (-not (Test-Path -LiteralPath $ImagePrintPreviewPolicyStatePath)) {
    return @{ enforced = $true; updatedAt = ''; reason = 'ekodi-forced-default' }
  }
  try {
    $state = Get-Content -LiteralPath $ImagePrintPreviewPolicyStatePath -Raw -Encoding UTF8 | ConvertFrom-Json
    return @{
      enforced = [bool]$state.enforced
      updatedAt = [string]$state.updatedAt
      reason = [string]$state.reason
    }
  } catch {
    return @{ enforced = $true; updatedAt = ''; reason = 'invalid-local-policy-state-fail-closed' }
  }
}

function Set-ImagePrintPreviewPolicyState([bool]$Enforced, [string]$Reason) {
  New-Item -ItemType Directory -Path $ImagePrintPreviewBackupRoot -Force | Out-Null
  @{
    enforced = $Enforced
    reason = $Reason
    updatedAt = (Get-Date).ToUniversalTime().ToString('o')
    policyId = 'EKODI-WINDOWS-IMAGE-PRINT-PREVIEW-001'
  } | ConvertTo-Json | Set-Content -LiteralPath $ImagePrintPreviewPolicyStatePath -Encoding UTF8
  return Get-ImagePrintPreviewPolicyState
}

function Get-ImagePrintPreviewState {
  $effectiveDropTargetPath = Join-Path $ImagePrintPreviewEffectiveKey 'DropTarget'
  $effectiveCommandPath = Join-Path $ImagePrintPreviewEffectiveKey 'command'
  $userDropTargetPath = Join-Path $ImagePrintPreviewUserKey 'DropTarget'
  $userCommandPath = Join-Path $ImagePrintPreviewUserKey 'command'
  $effectiveClsid = ''
  $effectiveCommand = ''
  $userClsid = ''
  $userCommand = ''
  try { if (Test-Path -LiteralPath $effectiveDropTargetPath) { $effectiveClsid = [string](Get-Item -LiteralPath $effectiveDropTargetPath).GetValue('Clsid') } } catch { }
  try { if (Test-Path -LiteralPath $effectiveCommandPath) { $effectiveCommand = [string](Get-Item -LiteralPath $effectiveCommandPath).GetValue('') } } catch { }
  try { if (Test-Path -LiteralPath $userDropTargetPath) { $userClsid = [string](Get-Item -LiteralPath $userDropTargetPath).GetValue('Clsid') } } catch { }
  try { if (Test-Path -LiteralPath $userCommandPath) { $userCommand = [string](Get-Item -LiteralPath $userCommandPath).GetValue('') } } catch { }
  $previewHandlerConfigured = $effectiveClsid -eq $ImagePrintPreviewClsid
  $userCommandOverride = [bool](Test-Path -LiteralPath $userCommandPath)
  return @{
    checkedAt = (Get-Date).ToUniversalTime().ToString('o')
    desiredClsid = $ImagePrintPreviewClsid
    effectiveClsid = $effectiveClsid
    effectiveCommand = $effectiveCommand
    userClsid = $userClsid
    userCommand = $userCommand
    userCommandOverride = $userCommandOverride
    previewHandlerConfigured = [bool]$previewHandlerConfigured
    previewFirst = [bool]($previewHandlerConfigured -and -not $userCommandOverride)
    policy = Get-ImagePrintPreviewPolicyState
  }
}

function Ensure-ImagePrintPreviewBackup {
  New-Item -ItemType Directory -Path $ImagePrintPreviewBackupRoot -Force | Out-Null
  if (Test-Path -LiteralPath $ImagePrintPreviewBackupMeta) {
    return Get-Content -LiteralPath $ImagePrintPreviewBackupMeta -Raw -Encoding UTF8 | ConvertFrom-Json
  }
  $userKeyExisted = Test-Path -LiteralPath $ImagePrintPreviewUserKey
  if ($userKeyExisted) {
    $null = & reg.exe export 'HKCU\Software\Classes\SystemFileAssociations\image\shell\print' $ImagePrintPreviewBackupReg /y 2>&1
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $ImagePrintPreviewBackupReg)) {
      throw 'image_print_preview_backup_failed'
    }
  }
  $meta = @{
    userKeyExisted = [bool]$userKeyExisted
    registryBackup = $(if ($userKeyExisted) { $ImagePrintPreviewBackupReg } else { '' })
    createdAt = (Get-Date).ToUniversalTime().ToString('o')
    agentVersion = $AgentVersion
  }
  $meta | ConvertTo-Json | Set-Content -LiteralPath $ImagePrintPreviewBackupMeta -Encoding UTF8
  return $meta
}

function Repair-ImagePrintPreview {
  [void](Ensure-ImagePrintPreviewBackup)
  $userCommandPath = Join-Path $ImagePrintPreviewUserKey 'command'
  $userDropTargetPath = Join-Path $ImagePrintPreviewUserKey 'DropTarget'
  if (Test-Path -LiteralPath $userCommandPath) {
    Remove-Item -LiteralPath $userCommandPath -Recurse -Force
  }
  New-Item -Path $ImagePrintPreviewUserKey -Force | Out-Null
  New-Item -Path $userDropTargetPath -Force | Out-Null
  New-ItemProperty -Path $userDropTargetPath -Name 'Clsid' -Value $ImagePrintPreviewClsid -PropertyType String -Force | Out-Null
  [void](Set-ImagePrintPreviewPolicyState $true 'user-requested-enforced-repair')
  $state = Get-ImagePrintPreviewState
  if (-not $state.previewFirst) { throw 'image_print_preview_verification_failed' }
  return @{
    message = '이미지 우클릭 인쇄가 Windows 사진 인쇄 미리보기/레이아웃을 먼저 사용하도록 복구했고 자동 재조정 규칙을 활성화했습니다.'
    printPreview = $state
  }
}

function Restore-ImagePrintPreview {
  $meta = $null
  if (Test-Path -LiteralPath $ImagePrintPreviewBackupMeta) {
    $meta = Get-Content -LiteralPath $ImagePrintPreviewBackupMeta -Raw -Encoding UTF8 | ConvertFrom-Json
  }
  [void](Set-ImagePrintPreviewPolicyState $false 'user-requested-restore')
  if (Test-Path -LiteralPath $ImagePrintPreviewUserKey) {
    Remove-Item -LiteralPath $ImagePrintPreviewUserKey -Recurse -Force
  }
  if ($meta -and $meta.userKeyExisted -and $meta.registryBackup -and (Test-Path -LiteralPath ([string]$meta.registryBackup))) {
    $null = & reg.exe import ([string]$meta.registryBackup) 2>&1
    if ($LASTEXITCODE -ne 0) { throw 'image_print_preview_restore_failed' }
  }
  return @{
    message = 'EKODI 인쇄 미리보기 강제 규칙을 해제하고 최초 변경 전 사용자 레지스트리 상태를 복원했습니다.'
    printPreview = Get-ImagePrintPreviewState
  }
}

function Reconcile-ImagePrintPreviewPolicy {
  $policy = Get-ImagePrintPreviewPolicyState
  if (-not $policy.enforced) { return }
  $state = Get-ImagePrintPreviewState
  if (-not $state.previewFirst) { [void](Repair-ImagePrintPreview) }
}

function Invoke-DeviceCommand([pscustomobject]$Command) {
  $type = [string]$Command.type
  $payload = if ($Command.PSObject.Properties.Name -contains 'payload' -and $Command.payload) { $Command.payload } else { [pscustomobject]@{} }
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
    'power.restore' { $guid = Restore-PowerBackup; return @{ message = 'EKODI 적용 전 전원 계획으로 복원했습니다.'; restoredScheme = $guid; settings = Get-AgentSettings } }
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
    'autologon.open' { return @{ message = Open-AutologonManager; settings = Get-AgentSettings } }
    'diagnostics.collect' { return @{ message = '시스템·저장공간·네트워크·프린터·시작프로그램·업데이트 진단을 완료했습니다.'; diagnostics = Get-FullDiagnostic; settings = Get-AgentSettings } }
    'computer.system.read' { return @{ message = '원격 컴퓨터 시스템 상태를 읽었습니다.'; system = Get-SystemSnapshot } }
    'computer.process.list' { return @{ message = '원격 컴퓨터 프로세스 목록을 읽었습니다.'; processes = Get-RemoteProcessList } }
    'computer.agent.status' { return @{ message = 'EKODI Native Remote Agent 상태를 읽었습니다.'; agent = Get-RemoteAgentStatus } }
    'computer.desktop.probe' { return Invoke-IsolatedDesktopBackendProbe }
    'computer.desktop.canary' { return Invoke-IsolatedDesktopHyperVCanary }
    'computer.desktop.guest.canary' { return Invoke-IsolatedDesktopGuestRuntimeCanary }
    'computer.desktop.ui.canary' { return Invoke-IsolatedDesktopGuestUiCanary }
    'computer.desktop.session.canary' { return Invoke-IsolatedDesktopSessionCanary }
    'computer.desktop.session.execute' { return Invoke-IsolatedDesktopSessionExecute $payload }
    'network.diagnose' { return @{ message = '네트워크 진단을 완료했습니다.'; network = Get-NetworkDiagnostic } }
    'printers.diagnose' { return @{ message = '프린터와 인쇄 대기열 진단을 완료했습니다.'; printers = Get-PrinterDiagnostic } }
    'printing.image_preview.status' { return @{ message = 'Windows 이미지 인쇄 미리보기 연결 상태를 확인했습니다.'; printPreview = Get-ImagePrintPreviewState } }
    'printing.image_preview.repair' { return Repair-ImagePrintPreview }
    'printing.image_preview.restore' { return Restore-ImagePrintPreview }
    'startup.scan' { return @{ message = '시작 프로그램 목록을 확인했습니다.'; startup = Get-StartupDiagnostic } }
    'startup.disable' { return Disable-StartupItem ([string]$payload.itemId) }
    'startup.restore' { return Restore-StartupItem ([string]$payload.itemId) }
    'maintenance.temp_cleanup' { return Clear-SafeTempFiles }
    'updates.scan' { $updates = Get-WindowsUpdateDiagnostic; return @{ message = 'Windows 업데이트 상태를 확인했습니다.'; pendingCount = $updates.pendingCount; rebootRequired = $updates.rebootPending; updates = $updates } }
    'updates.install' { return Install-WindowsUpdates }
    'profile.workstation.apply' { return Apply-WorkstationProfile }
    'profile.workstation.restore' { return Restore-WorkstationProfile }
    'agent.self_update' { return Update-AgentFromOfficialSource }
    'computer.browser.canary' { return Invoke-BackgroundBrowserCanary }
    'computer.browser.execute' { return Invoke-BackgroundBrowserWorker $payload }
    'remote_desktop.recovery.enable' { return Set-DesktopCommanderRecovery $true }
    'remote_desktop.recovery.disable' { return Set-DesktopCommanderRecovery $false }
    'remote_desktop.recovery.run' { return Ensure-DesktopCommanderRunning $true }
    default { throw "허용되지 않은 명령입니다: $type" }
  }
}


$script:DesktopRecoveryStatePath = Join-Path $PSScriptRoot 'managed-apps.json'
$script:LastDesktopRecoveryAttempt = [datetime]::MinValue

function Get-RemoteDesktopRecoveryConfig {
  if (!(Test-Path $script:DesktopRecoveryStatePath)) { return @{ enabled = $false } }
  try {
    $value = Get-Content $script:DesktopRecoveryStatePath -Raw | ConvertFrom-Json
    return @{ enabled = [bool]$value.desktopCommanderAutoRecovery }
  } catch { return @{ enabled = $false } }
}

function Set-RemoteDesktopRecoveryConfig([bool]$Enabled) {
  @{ desktopCommanderAutoRecovery = $Enabled; updatedAt = (Get-Date).ToUniversalTime().ToString('o') } |
    ConvertTo-Json | Set-Content -Path $script:DesktopRecoveryStatePath -Encoding UTF8
  return Get-RemoteDesktopRecoveryConfig
}

function Resolve-DesktopCommanderExecutable {
  $running = Get-Process -Name 'DesktopCommander' -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($running -and $running.Path) { return $running.Path }
  $candidates = @(
    "$env:LOCALAPPDATA\Programs\Desktop Commander\DesktopCommander.exe",
    "$env:LOCALAPPDATA\Programs\DesktopCommander\DesktopCommander.exe",
    "$env:ProgramFiles\Desktop Commander\DesktopCommander.exe",
    "$env:ProgramFiles(x86)\Desktop Commander\DesktopCommander.exe"
  )
  return ($candidates | Where-Object { Test-Path $_ } | Select-Object -First 1)
}

function Ensure-DesktopCommanderRunning([bool]$Force = $false) {
  $running = Get-Process -Name 'DesktopCommander' -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($running) { return @{ message = 'Remote Desktop Commander가 실행 중입니다.'; running = $true; recovered = $false } }
  if (!$Force -and ((Get-Date) - $script:LastDesktopRecoveryAttempt).TotalSeconds -lt 120) {
    return @{ message = 'Remote Desktop Commander 복구 재시도 대기 중입니다.'; running = $false; recovered = $false }
  }
  $script:LastDesktopRecoveryAttempt = Get-Date
  $exe = Resolve-DesktopCommanderExecutable
  if (!$exe) { return @{ message = 'Remote Desktop Commander 실행파일을 찾지 못했습니다.'; running = $false; recovered = $false } }
  Start-Process -FilePath $exe | Out-Null
  Start-Sleep -Milliseconds 700
  $started = [bool](Get-Process -Name 'DesktopCommander' -ErrorAction SilentlyContinue | Select-Object -First 1)
  return @{ message = $(if ($started) { 'Remote Desktop Commander를 자동 복구했습니다.' } else { 'Remote Desktop Commander 실행을 요청했지만 프로세스를 확인하지 못했습니다.' }); running = $started; recovered = $started }
}

function Set-DesktopCommanderRecovery([bool]$Enabled) {
  $config = Set-RemoteDesktopRecoveryConfig $Enabled
  if ($Enabled) {
    $result = Ensure-DesktopCommanderRunning $true
    return @{ message = "Remote Desktop Commander 자가복구를 활성화했습니다. $($result.message)"; enabled = $true; running = $result.running }
  }
  return @{ message = 'Remote Desktop Commander 자가복구를 비활성화했습니다.'; enabled = $false }
}

function Reconcile-DesktopCommanderRecovery {
  $config = Get-RemoteDesktopRecoveryConfig
  if ($config.enabled) { Ensure-DesktopCommanderRunning | Out-Null }
}

function Load-Config {
  if (-not (Test-Path $ConfigPath)) { throw 'EKODI Device Agent 설정 파일이 없습니다. 다시 등록해 주세요.' }
  return Get-Content $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
}

function Get-AgentHeaders($Config) {
  return @{ Authorization = "Bearer $(Unprotect-LocalSecret $Config.protectedToken)"; 'X-EKODI-Device-ID' = [string]$Config.deviceId }
}

function Send-Heartbeat($Config) {
  $settings = Get-AgentSettings
  $body = @{
    hostname = $env:COMPUTERNAME
    osVersion = Get-OsVersion
    agentVersion = $AgentVersion
    profileName = $settings.workstationProfile
    capabilities = @{
      powerProfiles = $true; resumeLock = $true; restore = $true; autologonLocalConsent = $true
      diagnostics = $true; storageMaintenance = $true; windowsUpdate = $true; startupManagement = $true
      networkDiagnostics = $true; printerDiagnostics = $true; imagePrintPreview = $true; workstationProfile = $true; protocolLaunch = $true
      computerRead = $true; processRead = $true; agentStatus = $true
      isolatedCommand = $false; filesystemRead = $false; filesystemWrite = $false; backgroundBrowserCanary = [bool](Get-BackgroundBrowserCanaryState).verified; backgroundBrowser = [bool](Get-BackgroundBrowserCanaryState).verified; isolatedDesktopProbe = $true; isolatedDesktopCanary = [bool](Get-IsolatedDesktopCanaryState).verified; isolatedDesktopGuestCanary = [bool](Get-IsolatedDesktopGuestCanaryState).verified; isolatedDesktopUiCanary = [bool](Get-IsolatedDesktopUiCanaryState).verified; isolatedDesktopSessionCanary = [bool](Get-IsolatedDesktopSessionCanaryState).verified; isolatedDesktop = [bool](Get-IsolatedDesktopSessionCanaryState).verified
      desktopCapture = $false; desktopInput = $false
      arbitraryShell = $false; screenCapture = $false; credentialCollection = $false
    }
    settings = $settings
  } | ConvertTo-Json -Depth 10
  Invoke-RestMethod -Method Post -Uri "$($Config.apiBase)/api/device-agent/heartbeat" -Headers (Get-AgentHeaders $Config) -ContentType 'application/json' -Body $body | Out-Null
}

function Complete-Command($Config, [string]$CommandId, [bool]$Success, $Result) {
  $body = @{ success = $Success; result = $Result } | ConvertTo-Json -Depth 12
  Invoke-RestMethod -Method Post -Uri "$($Config.apiBase)/api/device-agent/commands/$CommandId/result" -Headers (Get-AgentHeaders $Config) -ContentType 'application/json' -Body $body | Out-Null
}

function Poll-Command($Config) {
  $response = Invoke-RestMethod -Method Get -Uri "$($Config.apiBase)/api/device-agent/commands/next" -Headers (Get-AgentHeaders $Config)
  if (-not $response.command) { return }
  try {
    $result = Invoke-DeviceCommand $response.command
    Complete-Command $Config ([string]$response.command.id) $true $result
    if ([string]$response.command.type -eq 'agent.self_update' -and $result.restartRequired -eq $true) {
      $script:RestartAfterCommand = $true
    }
  } catch {
    Complete-Command $Config ([string]$response.command.id) $false @{ message = $_.Exception.Message }
  }
}

function Stop-ExistingAgentProcesses {
  try { Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue } catch { }
  try {
    foreach ($process in @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)) {
      if ([int]$process.ProcessId -eq $PID) { continue }
      if ([string]$process.Name -notin @('powershell.exe', 'pwsh.exe')) { continue }
      $line = [string]$process.CommandLine
      if (-not $line) { continue }
      if ($line.Contains($AgentPath) -and $line -match '(?i)(?:^|\s|\")-Run(?:\s|\"|$)') {
        Stop-Process -Id ([int]$process.ProcessId) -Force -ErrorAction SilentlyContinue
      }
    }
  } catch { }
  Start-Sleep -Milliseconds 350
}

function Ensure-AgentTask {
  $userId = [Security.Principal.WindowsIdentity]::GetCurrent().Name
  $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$AgentPath`" -Run"
  $trigger = New-ScheduledTaskTrigger -AtLogOn -User $userId
  $principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Highest
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null
}

function Copy-SelfToAgentPath {
  New-Item -ItemType Directory -Path $Root -Force | Out-Null
  $source = [IO.Path]::GetFullPath($PSCommandPath)
  $destination = [IO.Path]::GetFullPath($AgentPath)
  if ($source -ne $destination) { Copy-Item -LiteralPath $PSCommandPath -Destination $AgentPath -Force }
}

function Start-CurrentAgent {
  Ensure-AgentTask
  Start-AgentProcess
}

function Install-Agent {
  if (-not $EnrollmentCode) { Throw-AgentStageError 'EKA-200' 'enrollment' '-EnrollmentCode가 필요합니다.' }
  if ($ApiBase.TrimEnd('/') -ne $AllowedApiBase) { Throw-AgentStageError 'EKA-201' 'enrollment' '허용되지 않은 EKODI API 주소입니다.' }
  if (-not (Test-IsAdministrator)) {
    $args = @('-Install','-EnrollmentCode',"`"$EnrollmentCode`"",'-ApiBase',"`"$AllowedApiBase`"")
    if ($Label) { $args += @('-Label', "`"$Label`"") }
    [void](Invoke-ElevatedSelf $args)
    return
  }

  [void](Assert-AgentCandidate $PSCommandPath)
  $hadConfig = Test-Path $ConfigPath
  if ($hadConfig) {
    $result = Invoke-AgentUpgradeTransaction -CandidatePath $PSCommandPath
    Write-Host "기존 EKODI 기기 등록과 토큰을 유지하고 Agent $($result.version) 업그레이드·heartbeat 검증을 완료했습니다." -ForegroundColor Green
    return
  }

  $snapshot = $null
  $stage = 'snapshot'
  try {
    $snapshot = New-AgentUpgradeSnapshot
    $stage = 'replace_agent'
    Replace-AgentFileAtomically $PSCommandPath $snapshot
    $stage = 'register_protocol'
    Register-EkodiProtocol
    $stage = 'enrollment'
    $enrollmentBody = @{
      enrollmentCode = $EnrollmentCode
      platform = 'windows'
      hostname = $env:COMPUTERNAME
      label = $(if ($Label) { $Label } else { $env:COMPUTERNAME })
      osVersion = Get-OsVersion
      agentVersion = $AgentVersion
      capabilities = @{
        powerProfiles = $true; resumeLock = $true; restore = $true; autologonLocalConsent = $true
        diagnostics = $true; storageMaintenance = $true; windowsUpdate = $true; startupManagement = $true
        networkDiagnostics = $true; printerDiagnostics = $true; imagePrintPreview = $true; workstationProfile = $true; protocolLaunch = $true
        arbitraryShell = $false; screenCapture = $false; credentialCollection = $false
      }
    } | ConvertTo-Json -Depth 8
    $enrollment = Invoke-RestMethod -Method Post -Uri "$AllowedApiBase/api/device-agent/enroll" -ContentType 'application/json' -Body $enrollmentBody
    @{
      deviceId = [string]$enrollment.deviceId
      apiBase = $AllowedApiBase
      protectedToken = Protect-LocalSecret ([string]$enrollment.deviceToken)
      installedAt = (Get-Date).ToUniversalTime().ToString('o')
    } | ConvertTo-Json | Set-Content -Path $ConfigPath -Encoding UTF8
    $stage = 'register_task'
    Ensure-AgentTask
    $stage = 'start_agent'
    Start-AgentProcess
    Start-Sleep -Milliseconds 700
    if (-not (Test-AgentRunProcess)) { throw '신규 Agent 실행 프로세스를 확인하지 못했습니다.' }
    $stage = 'heartbeat_verify'
    if (-not (Test-AgentHeartbeatResume)) { throw '신규 Agent heartbeat를 확인하지 못했습니다.' }
    Remove-AgentUpgradeSnapshot $snapshot
    Write-Host "EKODI Device Agent 등록 및 heartbeat 검증 완료: $($enrollment.deviceId)" -ForegroundColor Green
  } catch {
    $failure = $_
    if ($snapshot) {
      try { Restore-AgentUpgradeSnapshot $snapshot; Remove-AgentUpgradeSnapshot $snapshot } catch {
        Throw-AgentStageError 'EKA-290' 'rollback' "신규 설치 실패 후 롤백에도 실패했습니다. 원래 단계=$stage; 원래 오류=$($failure.Exception.Message)" $_
      }
    }
    Throw-AgentStageError 'EKA-299' $stage '신규 Device Agent 설치를 중단하고 로컬 상태를 롤백했습니다.' $failure
  }
}

function Register-ProtocolOnly {
  if (-not (Test-IsAdministrator)) {
    [void](Invoke-ElevatedSelf @('-RegisterProtocol'))
    return
  }
  [void](Assert-AgentCandidate $PSCommandPath)
  $hadConfig = Test-Path $ConfigPath
  if ($hadConfig) {
    $result = Invoke-AgentUpgradeTransaction -CandidatePath $PSCommandPath
    Write-Host "기존 등록을 유지한 채 Agent $($result.version) 업그레이드·프로토콜·heartbeat 검증을 완료했습니다." -ForegroundColor Green
  } else {
    $snapshot = New-AgentUpgradeSnapshot
    try {
      Replace-AgentFileAtomically $PSCommandPath $snapshot
      Register-EkodiProtocol
      Remove-AgentUpgradeSnapshot $snapshot
      Write-Host 'EKODI 원클릭 PC 연결 프로그램을 설치했습니다. 관리자 사이트에서 “이 PC 연결 계속”을 누르세요.' -ForegroundColor Green
    } catch {
      $failure = $_
      try { Restore-AgentUpgradeSnapshot $snapshot; Remove-AgentUpgradeSnapshot $snapshot } catch {
        Throw-AgentStageError 'EKA-390' 'rollback' '원클릭 연결 프로그램 설치 실패 후 롤백에도 실패했습니다.' $_
      }
      Throw-AgentStageError 'EKA-399' 'protocol_install' '원클릭 연결 프로그램 설치를 롤백했습니다.' $failure
    }
  }
}

function Handle-ProtocolUrl([string]$Url) {
  $request = Parse-ProtocolEnrollment $Url
  $script:EnrollmentCode = [string]$request.enrollmentCode
  $script:ApiBase = $AllowedApiBase
  $script:Label = [string]$request.label
  Install-Agent
}

function Run-Agent {
  $mutex = [Threading.Mutex]::new($false, 'Global\EKODI_Device_Agent_V2')
  if (-not $mutex.WaitOne(0, $false)) { return }
  try {
    $config = Load-Config
    $lastHeartbeat = [datetime]::MinValue
    while ($true) {
      try {
        if (((Get-Date) - $lastHeartbeat).TotalSeconds -ge 60) { Send-Heartbeat $config; $lastHeartbeat = Get-Date }
        Reconcile-DesktopCommanderRecovery
        Reconcile-ImagePrintPreviewPolicy
        Poll-Command $config
        if ($script:RestartAfterCommand) { break }
      } catch {
        # 네트워크 중단은 다음 주기에 자동 복구합니다. 임의 명령 실행으로 우회하지 않습니다.
      }
      Start-Sleep -Seconds 10
    }
  } finally {
    $restart = [bool]$script:RestartAfterCommand
    try { $mutex.ReleaseMutex() } catch { }
    $mutex.Dispose()
    if ($restart) {
      Start-Sleep -Milliseconds 500
      Start-AgentProcess
    }
  }
}

try {
  if ($ProtocolUrl) { Handle-ProtocolUrl $ProtocolUrl; exit }
  if ($RegisterProtocol) { Register-ProtocolOnly; exit }
  if ($Install) { Install-Agent; exit }
  if ($Run) { Run-Agent; exit }

  Write-Host "EKODI Device Agent $AgentVersion" -ForegroundColor Cyan
  Write-Host '등록: -Install -EnrollmentCode <코드>'
  Write-Host '원클릭 연결 등록: -RegisterProtocol'
  Write-Host '실행: -Run'
} catch {
  Write-ElevationFailureRecord $ElevationResultPath $_.Exception.Message
  throw
}
