param(
  [switch]$Install,
  [switch]$RunOnce
)

$ErrorActionPreference = 'Stop'
$GuestAgentVersion = '1.0.0'
$Root = Join-Path $env:ProgramData 'EKODI\GuestAgent'
$AgentPath = Join-Path $Root 'ekodi-isolated-guest-agent.ps1'
$TaskPath = Join-Path $Root 'task.json'
$ReceiptPath = Join-Path $Root 'receipt.json'
$TaskName = 'EKODI Isolated Guest Agent'

function Get-Sha256String([string]$Value) {
  $sha = [Security.Cryptography.SHA256]::Create()
  try {
    return ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($Value)))).Replace('-','').ToLowerInvariant()
  } finally { $sha.Dispose() }
}

function Test-IsSystem {
  try {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    return $identity.User.Value -eq 'S-1-5-18'
  } catch { return $false }
}

function Read-ValidatedTask {
  if (-not (Test-Path -LiteralPath $TaskPath)) { return $null }
  $raw = Get-Content -LiteralPath $TaskPath -Raw -Encoding UTF8
  $task = $raw | ConvertFrom-Json
  if ([int]$task.schemaVersion -ne 1) { throw 'guest_task_schema_invalid' }
  if ([string]$task.type -ne 'guest.runtime.probe') { throw 'guest_task_type_forbidden' }
  if ([string]$task.taskId -notmatch '^[a-f0-9]{32}$') { throw 'guest_task_id_invalid' }
  if ([string]$task.nonce -notmatch '^[a-f0-9]{64}$') { throw 'guest_task_nonce_invalid' }
  if ([string]$task.networkPolicy -ne 'none') { throw 'guest_task_network_policy_invalid' }
  $expires = [DateTime]::Parse([string]$task.expiresAt).ToUniversalTime()
  $now = [DateTime]::UtcNow
  if ($expires -le $now -or $expires -gt $now.AddMinutes(15)) { throw 'guest_task_expiry_invalid' }
  return @{ raw = $raw; task = $task; expires = $expires }
}

function Get-NetworkEvidence {
  $adapters = @()
  try { $adapters = @(Get-NetAdapter -ErrorAction Stop) } catch { }
  $up = @($adapters | Where-Object { [string]$_.Status -eq 'Up' })
  return @{
    adapterCount = $adapters.Count
    upAdapterCount = $up.Count
    noNetworkAdapter = ($adapters.Count -eq 0)
    noActiveNetwork = ($up.Count -eq 0)
  }
}

function Invoke-GuestRuntimeProbe($ValidatedTask) {
  $task = $ValidatedTask.task
  $network = Get-NetworkEvidence
  if (-not $network.noNetworkAdapter -or -not $network.noActiveNetwork) {
    throw 'guest_network_isolation_failed'
  }

  $receipt = @{
    schemaVersion = 1
    ok = $true
    mode = 'ekodi-isolated-guest-runtime-canary'
    guestAgentVersion = $GuestAgentVersion
    taskType = [string]$task.type
    taskId = [string]$task.taskId
    nonceSha256 = Get-Sha256String ([string]$task.nonce)
    taskSha256 = Get-Sha256String ([string]$ValidatedTask.raw)
    executedAsSystem = [bool](Test-IsSystem)
    processId = $PID
    sessionId = [Diagnostics.Process]::GetCurrentProcess().SessionId
    computerName = $env:COMPUTERNAME
    osVersion = [Environment]::OSVersion.VersionString
    powershellVersion = [string]$PSVersionTable.PSVersion
    networkAdapterCount = [int]$network.adapterCount
    activeNetworkAdapterCount = [int]$network.upAdapterCount
    noNetworkAdapter = [bool]$network.noNetworkAdapter
    noActiveNetwork = [bool]$network.noActiveNetwork
    interactiveDesktopUsed = $false
    sharedInteractiveDesktop = $false
    clipboardShared = $false
    userInputInjection = $false
    credentialCollection = $false
    hostProfileMounted = $false
    mutationScope = 'ephemeral-guest-only'
    checkedAt = (Get-Date).ToUniversalTime().ToString('o')
  }

  if (-not $receipt.executedAsSystem) { throw 'guest_agent_not_system' }
  $temp = "$ReceiptPath.tmp"
  $receipt | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $temp -Encoding UTF8
  Move-Item -LiteralPath $temp -Destination $ReceiptPath -Force
  Remove-Item -LiteralPath $TaskPath -Force -ErrorAction SilentlyContinue
  return $receipt
}

function Install-GuestAgent {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]::new($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'guest_agent_install_requires_admin'
  }
  New-Item -ItemType Directory -Path $Root -Force | Out-Null
  $source = [IO.Path]::GetFullPath($PSCommandPath)
  $destination = [IO.Path]::GetFullPath($AgentPath)
  if ($source -ne $destination) { Copy-Item -LiteralPath $source -Destination $AgentPath -Force }

  $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$AgentPath`" -RunOnce"
  $trigger = New-ScheduledTaskTrigger -AtStartup
  $taskPrincipal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Seconds 20) -ExecutionTimeLimit (New-TimeSpan -Minutes 3)
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $taskPrincipal -Settings $settings -Force | Out-Null
  Write-Host "EKODI Isolated Guest Agent $GuestAgentVersion installed."
}

if ($Install) {
  Install-GuestAgent
  exit 0
}
if ($RunOnce) {
  try {
    $task = Read-ValidatedTask
    if ($null -ne $task) { [void](Invoke-GuestRuntimeProbe $task) }
    exit 0
  } catch {
    $failure = @{
      schemaVersion = 1
      ok = $false
      mode = 'ekodi-isolated-guest-runtime-canary'
      guestAgentVersion = $GuestAgentVersion
      error = $_.Exception.Message
      checkedAt = (Get-Date).ToUniversalTime().ToString('o')
    }
    New-Item -ItemType Directory -Path $Root -Force | Out-Null
    $failure | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $ReceiptPath -Encoding UTF8
    exit 1
  }
}
Write-Host 'Use -Install or -RunOnce.'
