param(
  [string]$EnrollmentCode = $env:EKODI_POS_ENROLLMENT_CODE,
  [switch]$Disable
)

# EKODI POS Agent central status enrollment (optional).
#
# Registers this POS PC with the existing EKODI Device Agent registry as a
# POS-type device so the central admin can see online/offline, Agent version and
# which configured programs are running. The Agent then sends an outbound-only
# status heartbeat. It never polls or executes remote commands, and window
# titles never leave this PC.

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ApiBase = 'https://ekodi.kr'
$Root = Join-Path $env:ProgramData 'EKODI\POSAgent'
$ConfigPath = Join-Path $Root 'pos-agent.config.json'
$CredentialPath = Join-Path $Root 'device-credential.json'
$TaskName = 'EKODI POS Agent'

function Test-IsAdministrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  return ([Security.Principal.WindowsPrincipal]$identity).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Save-AgentConfig($Config) {
  $temp = "$ConfigPath.tmp"
  $Config | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $temp -Encoding UTF8
  Move-Item -LiteralPath $temp -Destination $ConfigPath -Force
}

function Set-CentralHeartbeat($Config, [bool]$Enabled) {
  $value = [pscustomobject]@{ enabled = $Enabled; apiBase = $ApiBase; intervalSeconds = 60 }
  if ($Config.PSObject.Properties.Name -contains 'centralHeartbeat') { $Config.centralHeartbeat = $value }
  else { $Config | Add-Member -NotePropertyName 'centralHeartbeat' -NotePropertyValue $value }
}

function Restart-AgentIfScheduled {
  $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if ($null -eq $task) {
    Write-Host 'Restart the Agent (start-pos-agent.cmd) or sign out and in again to apply the change.' -ForegroundColor Yellow
    return
  }
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2
  Start-ScheduledTask -TaskName $TaskName
  Write-Host 'EKODI POS Agent restarted.'
}

if (-not (Test-IsAdministrator)) { throw 'Run this enrollment as Administrator (use enroll-pos-agent.cmd).' }
if (-not (Test-Path -LiteralPath $ConfigPath)) { throw "EKODI POS Agent is not installed on this PC ($ConfigPath not found). Install it first with setup-pos-agent.cmd." }
$config = Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json

if ($Disable) {
  Set-CentralHeartbeat $config $false
  Save-AgentConfig $config
  if (Test-Path -LiteralPath $CredentialPath) { Remove-Item -LiteralPath $CredentialPath -Force }
  Write-Host 'Central status heartbeat disabled and the local device credential was removed.' -ForegroundColor Green
  Write-Host 'Also revoke this device in EKODI Device management if it should no longer appear there.'
  Restart-AgentIfScheduled
  exit 0
}

$code = [string]$EnrollmentCode
if ([string]::IsNullOrWhiteSpace($code)) { $code = Read-Host 'Enter the one-time EKODI enrollment code (issued as a POS device)' }
$code = $code.Trim()
if ($code -notmatch '^[A-Za-z0-9-]{6,100}$') { throw 'The enrollment code format is not valid.' }

$os = ''
try { $os = [string][Environment]::OSVersion.VersionString } catch {}
$body = [ordered]@{
  enrollmentCode = $code
  platform = 'windows'
  hostname = [string]$env:COMPUTERNAME
  osVersion = $os
  agentVersion = 'pos-0.2.0'
  label = "POS $env:COMPUTERNAME"
  capabilities = [ordered]@{ posAgent = $true; remoteCommands = $false; focusMode = 'explicit_user_action_only' }
} | ConvertTo-Json -Depth 5 -Compress

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$response = Invoke-RestMethod -Method Post -Uri "$ApiBase/api/device-agent/enroll" -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body)) -TimeoutSec 30

$deviceId = [string]$response.deviceId
$token = [string]$response.deviceToken
if ($deviceId -notmatch '^dev_[A-Za-z0-9-]{8,80}$' -or $token -notmatch '^[a-f0-9]{32,128}$') { throw 'Enrollment response was not valid. Nothing was saved.' }
if ([string]$response.deviceType -ne 'pos') {
  Write-Host "This enrollment code was issued for device type '$($response.deviceType)', not POS. Nothing was saved." -ForegroundColor Red
  Write-Host 'Revoke the new device in EKODI Device management and issue a new code with device type POS.'
  exit 2
}

New-Item -ItemType Directory -Path $Root -Force | Out-Null
[pscustomobject]@{ deviceId = $deviceId; deviceToken = $token; apiBase = $ApiBase; enrolledAt = [DateTime]::UtcNow.ToString('o') } |
  ConvertTo-Json -Compress | Set-Content -LiteralPath $CredentialPath -Encoding UTF8
# Restrict the credential: SYSTEM and Administrators full control, the signed-in POS user read-only.
$user = "$env:USERDOMAIN\$env:USERNAME"
& icacls.exe $CredentialPath /inheritance:r /grant:r '*S-1-5-18:F' '*S-1-5-32-544:F' "${user}:R" | Out-Null

Set-CentralHeartbeat $config $true
Save-AgentConfig $config
Write-Host "EKODI POS Agent enrolled for central status: $($response.label)" -ForegroundColor Green
Write-Host 'Only status (online, Agent version, configured/running program ids) is reported. No remote commands are accepted.'
Restart-AgentIfScheduled
