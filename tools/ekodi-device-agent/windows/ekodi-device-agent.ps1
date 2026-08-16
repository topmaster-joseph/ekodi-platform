param(
  [switch]$Install,
  [switch]$Run,
  [switch]$RegisterProtocol,
  [string]$EnrollmentCode = '',
  [string]$ApiBase = 'https://api.ekodi.kr',
  [string]$Label = '',
  [string]$ProtocolUrl = ''
)

$ErrorActionPreference = 'Stop'
$AgentVersion = '2.0.1'
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
$AllowedApiBase = 'https://api.ekodi.kr'

function Test-IsAdministrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]::new($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
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
    return @{
      cpuLoadPct = $cpu
      memoryUsedPct = $usedPct
      memoryTotalGB = [math]::Round($totalKb / 1MB, 1)
      uptimeHours = [math]::Round($uptime.TotalHours, 1)
      batteryPct = $(if ($battery.Count) { [int]$battery[0].EstimatedChargeRemaining } else { $null })
      batteryStatus = $(if ($battery.Count) { [string]$battery[0].BatteryStatus } else { 'not-present' })
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
    $addresses = [Net.Dns]::GetHostAddresses('api.ekodi.kr')
    $dnsOk = $addresses.Count -gt 0
  } catch { $issues += 'dns_failed' }
  try {
    $apiReachable = [bool](Test-NetConnection -ComputerName 'api.ekodi.kr' -Port 443 -InformationLevel Quiet -WarningAction SilentlyContinue)
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
    @{ name = 'My EKODI'; url = 'https://my.ekodi.kr' },
    @{ name = 'EKODI Community'; url = 'https://community.ekodi.kr' },
    @{ name = 'Marketing AI'; url = 'https://marketing.ekodi.kr' },
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

function Update-AgentFromOfficialSource {
  $temp = Join-Path $env:TEMP 'ekodi-device-agent-update.ps1'
  Invoke-WebRequest -UseBasicParsing $AgentSourceUrl -OutFile $temp
  $content = Get-Content $temp -Raw -Encoding UTF8
  if (-not (Test-AgentSourceSafety $content)) { throw '공식 Agent 업데이트 파일 검증에 실패했습니다.' }
  Copy-Item -LiteralPath $temp -Destination $AgentPath -Force
  Register-EkodiProtocol
  return @{ message = 'EKODI Device Agent 파일과 원클릭 연결 프로토콜을 업데이트했습니다. 실행 중인 Agent는 다음 재시작부터 새 버전을 사용합니다.'; settings = Get-AgentSettings }
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
    'network.diagnose' { return @{ message = '네트워크 진단을 완료했습니다.'; network = Get-NetworkDiagnostic } }
    'printers.diagnose' { return @{ message = '프린터와 인쇄 대기열 진단을 완료했습니다.'; printers = Get-PrinterDiagnostic } }
    'startup.scan' { return @{ message = '시작 프로그램 목록을 확인했습니다.'; startup = Get-StartupDiagnostic } }
    'startup.disable' { return Disable-StartupItem ([string]$payload.itemId) }
    'startup.restore' { return Restore-StartupItem ([string]$payload.itemId) }
    'maintenance.temp_cleanup' { return Clear-SafeTempFiles }
    'updates.scan' { $updates = Get-WindowsUpdateDiagnostic; return @{ message = 'Windows 업데이트 상태를 확인했습니다.'; pendingCount = $updates.pendingCount; rebootRequired = $updates.rebootPending; updates = $updates } }
    'updates.install' { return Install-WindowsUpdates }
    'profile.workstation.apply' { return Apply-WorkstationProfile }
    'profile.workstation.restore' { return Restore-WorkstationProfile }
    'agent.self_update' { return Update-AgentFromOfficialSource }
    default { throw "허용되지 않은 명령입니다: $type" }
  }
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
      networkDiagnostics = $true; printerDiagnostics = $true; workstationProfile = $true; protocolLaunch = $true
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
  Start-Process powershell.exe -WindowStyle Hidden -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',"`"$AgentPath`"",'-Run')
}

function Install-Agent {
  if (-not $EnrollmentCode) { throw '-EnrollmentCode가 필요합니다.' }
  if ($ApiBase.TrimEnd('/') -ne $AllowedApiBase) { throw '허용되지 않은 EKODI API 주소입니다.' }
  if (-not (Test-IsAdministrator)) {
    $arguments = @('-NoProfile','-ExecutionPolicy','Bypass','-File',"`"$PSCommandPath`"",'-Install','-EnrollmentCode',"`"$EnrollmentCode`"",'-ApiBase',"`"$AllowedApiBase`"")
    if ($Label) { $arguments += @('-Label', "`"$Label`"") }
    Start-Process powershell.exe -Verb RunAs -ArgumentList $arguments
    return
  }

  $hadConfig = Test-Path $ConfigPath
  if ($hadConfig) { Stop-ExistingAgentProcesses }
  Copy-SelfToAgentPath
  Register-EkodiProtocol
  if ($hadConfig) {
    Start-CurrentAgent
    Write-Host '기존 EKODI 기기 등록과 토큰을 유지한 채 Agent를 최신 버전으로 전환했습니다.' -ForegroundColor Green
    return
  }

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
      networkDiagnostics = $true; printerDiagnostics = $true; workstationProfile = $true; protocolLaunch = $true
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
  Start-CurrentAgent
  Write-Host "EKODI Device Agent 등록 완료: $($enrollment.deviceId)" -ForegroundColor Green
}

function Register-ProtocolOnly {
  if (-not (Test-IsAdministrator)) {
    Start-Process powershell.exe -Verb RunAs -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',"`"$PSCommandPath`"",'-RegisterProtocol')
    return
  }
  $hadConfig = Test-Path $ConfigPath
  if ($hadConfig) { Stop-ExistingAgentProcesses }
  Copy-SelfToAgentPath
  Register-EkodiProtocol
  if ($hadConfig) {
    Start-CurrentAgent
    Write-Host '기존 등록을 유지한 채 EKODI Device Agent 업그레이드와 원클릭 연결 준비를 완료했습니다.' -ForegroundColor Green
  } else {
    Write-Host 'EKODI 원클릭 PC 연결 프로그램을 설치했습니다. 관리자 사이트에서 “이 PC 연결 계속”을 누르세요.' -ForegroundColor Green
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
        Poll-Command $config
      } catch {
        # 네트워크 중단은 다음 주기에 자동 복구합니다. 임의 명령 실행으로 우회하지 않습니다.
      }
      Start-Sleep -Seconds 10
    }
  } finally {
    try { $mutex.ReleaseMutex() } catch { }
    $mutex.Dispose()
  }
}

if ($ProtocolUrl) { Handle-ProtocolUrl $ProtocolUrl; exit }
if ($RegisterProtocol) { Register-ProtocolOnly; exit }
if ($Install) { Install-Agent; exit }
if ($Run) { Run-Agent; exit }

Write-Host 'EKODI Device Agent 2.0.1' -ForegroundColor Cyan
Write-Host '등록: -Install -EnrollmentCode <코드>'
Write-Host '원클릭 연결 등록: -RegisterProtocol'
Write-Host '실행: -Run'
