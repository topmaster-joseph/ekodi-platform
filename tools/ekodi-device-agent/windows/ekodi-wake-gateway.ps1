param(
  [switch]$Install,
  [switch]$Run,
  [string]$EnrollmentCode = '',
  [string]$ApiBase = 'https://api.ekodi.kr',
  [string]$Label = ''
)

$ErrorActionPreference = 'Stop'
$GatewayVersion = '1.0.0'
$Root = Join-Path $env:ProgramData 'EKODI\WakeGateway'
$ScriptPath = Join-Path $Root 'ekodi-wake-gateway.ps1'
$ConfigPath = Join-Path $Root 'config.json'
$TaskName = 'EKODI Wake Gateway'
$AllowedApiBase = 'https://api.ekodi.kr'

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
    $portable = @(8,9,10,14,30,31,32)
    $chassis = @($(if ($enclosure.Count) { $enclosure[0].ChassisTypes } else { @() }) | ForEach-Object { [int]$_ })
    return ($battery.Count -gt 0) -or ([int]$computer.PCSystemType -eq 2) -or (@($chassis | Where-Object { $portable -contains $_ }).Count -gt 0)
  } catch { return $false }
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

function Invoke-Api([string]$Method, [string]$Path, $Body = $null, $Config = $null) {
  $headers = @{}
  if ($Config) {
    $headers['Authorization'] = 'Bearer ' + (Unprotect-LocalSecret ([string]$Config.tokenProtected))
    $headers['X-EKODI-Wake-Gateway-Id'] = [string]$Config.gatewayId
  }
  $params = @{ Method=$Method; Uri=($AllowedApiBase + $Path); Headers=$headers; UseBasicParsing=$true; TimeoutSec=20 }
  if ($null -ne $Body) {
    $params.ContentType = 'application/json'
    $params.Body = ($Body | ConvertTo-Json -Depth 8 -Compress)
  }
  return Invoke-RestMethod @params
}

function Send-WakePacket([string]$Mac, [string]$Broadcast, [int]$Port) {
  $hex = $Mac.Replace(':','').Replace('-','')
  if ($hex -notmatch '^[0-9A-Fa-f]{12}$') { throw 'MAC 주소 형식이 올바르지 않습니다.' }
  $macBytes = New-Object byte[] 6
  for ($i=0; $i -lt 6; $i++) { $macBytes[$i] = [Convert]::ToByte($hex.Substring($i*2,2),16) }
  $packet = New-Object byte[] 102
  0..5 | ForEach-Object { $packet[$_] = 0xFF }
  for ($repeat=0; $repeat -lt 16; $repeat++) {
    [Array]::Copy($macBytes, 0, $packet, 6 + ($repeat * 6), 6)
  }
  $client = [Net.Sockets.UdpClient]::new()
  try {
    $client.EnableBroadcast = $true
    $endpoint = [Net.IPEndPoint]::new([Net.IPAddress]::Parse($Broadcast), $Port)
    [void]$client.Send($packet, $packet.Length, $endpoint)
  } finally { $client.Dispose() }
}

function Save-Config($Gateway) {
  New-Item -ItemType Directory -Path $Root -Force | Out-Null
  $config = @{
    gatewayId = [string]$Gateway.id
    tokenProtected = Protect-LocalSecret ([string]$Gateway.token)
    label = [string]$Gateway.label
    apiBase = $AllowedApiBase
    installedAt = (Get-Date).ToUniversalTime().ToString('o')
  }
  $config | ConvertTo-Json -Depth 5 | Set-Content -Path $ConfigPath -Encoding UTF8
}
function Load-Config {
  if (-not (Test-Path $ConfigPath)) { throw 'Wake Gateway 설정이 없습니다.' }
  return Get-Content $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
}

function Copy-Self {
  New-Item -ItemType Directory -Path $Root -Force | Out-Null
  $source = [IO.Path]::GetFullPath($PSCommandPath)
  $target = [IO.Path]::GetFullPath($ScriptPath)
  if ($source -ne $target) { Copy-Item -LiteralPath $source -Destination $target -Force }
}

function Ensure-Task {
  $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$ScriptPath`" -Run"
  $trigger = New-ScheduledTaskTrigger -AtStartup
  $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
}

function Install-Gateway {
  if (-not (Test-IsAdministrator)) { throw '관리자 권한으로 실행해야 합니다.' }
  if (Test-IsPortable) { throw '노트북은 EKODI Wake Gateway로 사용하지 않습니다.' }
  if ($ApiBase.TrimEnd('/') -ne $AllowedApiBase) { throw '허용되지 않은 API 주소입니다.' }
  if (-not $EnrollmentCode) { throw '관리자페이지에서 발급한 Wake Gateway 등록 코드가 필요합니다.' }
  Copy-Self
  $gatewayLabel = if ($Label) { $Label } else { "$env:COMPUTERNAME Wake Gateway" }
  $response = Invoke-Api 'POST' '/api/wake-agent/enroll' @{ code=$EnrollmentCode; label=$gatewayLabel; capabilities=@{ wol=$true; platform='windows'; version=$GatewayVersion } }
  if (-not $response.gateway.id -or -not $response.gateway.token) { throw 'Wake Gateway 등록 응답이 올바르지 않습니다.' }
  Save-Config $response.gateway
  Ensure-Task
  Start-ScheduledTask -TaskName $TaskName
  Write-Host "EKODI Wake Gateway 등록 완료: $($response.gateway.id)"
}

function Run-Gateway {
  $config = Load-Config
  $mutex = [Threading.Mutex]::new($false, 'Global\EKODI-Wake-Gateway')
  if (-not $mutex.WaitOne(0)) { return }
  try {
    $lastHeartbeat = [DateTime]::MinValue
    while ($true) {
      try {
        if (((Get-Date) - $lastHeartbeat).TotalSeconds -ge 45) {
          Invoke-Api 'POST' '/api/wake-agent/heartbeat' @{} $config | Out-Null
          $lastHeartbeat = Get-Date
        }
        $next = Invoke-Api 'GET' '/api/wake-agent/requests/next' $null $config
        if ($next.request) {
          $request = $next.request
          $ok = $false; $message = ''
          try {
            if ([string]$request.strategy -ne 'wol') { throw "지원하지 않는 Wake 전략: $($request.strategy)" }
            Send-WakePacket ([string]$request.macAddress) ([string]$request.broadcastAddress) ([int]$request.port)
            $ok = $true; $message = "WOL magic packet sent to $($request.macAddress)"
          } catch { $message = $_.Exception.Message }
          Invoke-Api 'POST' ("/api/wake-agent/requests/" + [Uri]::EscapeDataString([string]$request.id) + '/result') @{ success=$ok; message=$message } $config | Out-Null
        }
      } catch {
        # 네트워크 장애나 API 일시 오류는 다음 주기에 자동 복구합니다.
      }
      Start-Sleep -Seconds 8
    }
  } finally {
    try { $mutex.ReleaseMutex() } catch {}
    $mutex.Dispose()
  }
}

if ($Install) { Install-Gateway; exit 0 }
if ($Run) { Run-Gateway; exit 0 }
Write-Host '사용법: -Install -EnrollmentCode <code> 또는 -Run'
