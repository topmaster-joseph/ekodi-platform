param(
  [string]$InstallDir = "$env:ProgramData\EKODI\POSAgent",
  [string]$TaskName = 'EKODI POS Agent',
  [switch]$NoStart
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
# EKODI_POS_INSTALLER_COMPAT=task-scheduler-0x80041318-v2
$InstallerCompatibility = 'task-scheduler-0x80041318-v2'

function Test-IsAdministrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]::new($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Validate-PowerShellFile([string]$Path) {
  $tokens = $null
  $errors = $null
  [void][System.Management.Automation.Language.Parser]::ParseFile($Path, [ref]$tokens, [ref]$errors)
  if ($errors.Count -gt 0) {
    throw "PowerShell candidate parse failed: $($errors[0].Message)"
  }
}

function Read-AgentConfig([string]$Path) {
  $cfg = Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json
  $prefix = [string]$cfg.listenerPrefix
  if ($prefix -notmatch '^http://(127\.0\.0\.1|localhost):\d+/
if (-not (Test-IsAdministrator)) {
  throw 'Administrator privileges are required to install the EKODI POS Agent scheduled task.'
}

$sourceAgent = Join-Path $PSScriptRoot 'EKODI-POS-Agent.ps1'
$sourceConfig = Join-Path $PSScriptRoot 'pos-agent.config.example.json'
if (-not (Test-Path -LiteralPath $sourceAgent)) { throw "Agent source missing: $sourceAgent" }
if (-not (Test-Path -LiteralPath $sourceConfig)) { throw "Config example missing: $sourceConfig" }

New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
$candidateAgent = Join-Path $InstallDir 'EKODI-POS-Agent.candidate.ps1'
$targetAgent = Join-Path $InstallDir 'EKODI-POS-Agent.ps1'
$targetConfig = Join-Path $InstallDir 'pos-agent.config.json'
$backupAgent = Join-Path $InstallDir 'EKODI-POS-Agent.rollback.ps1'

Copy-Item -LiteralPath $sourceAgent -Destination $candidateAgent -Force
Validate-PowerShellFile $candidateAgent
if (-not (Test-Path -LiteralPath $targetConfig)) {
  Copy-Item -LiteralPath $sourceConfig -Destination $targetConfig
}
$config = Read-AgentConfig $targetConfig

$existingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
$hadAgent = Test-Path -LiteralPath $targetAgent
if ($hadAgent) { Copy-Item -LiteralPath $targetAgent -Destination $backupAgent -Force }

try {
  if ($existingTask) {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 250
  }

  Move-Item -LiteralPath $candidateAgent -Destination $targetAgent -Force

  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $userName = $identity.Name
  $arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$targetAgent`" -ConfigPath `"$targetConfig`""
  $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arguments
  $trigger = New-ScheduledTaskTrigger -AtLogOn -User $userName
  $principal = New-ScheduledTaskPrincipal -UserId $userName -LogonType Interactive -RunLevel Highest
  $registrationMode = 'restart-1m'
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
  try {
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
  } catch {
    if (Test-TaskSchemaRangeError $_) {
      Write-Host 'Task Scheduler rejected an XML range value (0x80041318). Retrying with compatibility-safe settings.' -ForegroundColor Yellow
      $registrationMode = 'compat-no-restart'
      $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero)
      Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
    } else {
      throw
    }
  }

  $registeredTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
  if (-not $registeredTask) { throw 'Agent scheduled task registration could not be verified.' }
  if ($registeredTask.Principal.UserId -and $registeredTask.Principal.UserId -ne $userName) {
    throw "Agent scheduled task user mismatch: $($registeredTask.Principal.UserId)"
  }

  if (-not $NoStart) {
    Start-ScheduledTask -TaskName $TaskName
    $store = @($config.allowedStores | Where-Object { $_ } | Select-Object -First 1)
    $headers = @{}
    if ($store.Count) { $headers['X-EKODI-Store'] = [string]$store[0] }
    $healthUrl = ([string]$config.listenerPrefix).TrimEnd('/') + '/v1/health'
    $healthy = $false
    for ($attempt = 1; $attempt -le 20; $attempt++) {
      Start-Sleep -Milliseconds 500
      try {
        $health = Invoke-RestMethod -Uri $healthUrl -Method Get -Headers $headers -TimeoutSec 2
        if ($health.ok) { $healthy = $true; break }
      } catch {}
    }
    if (-not $healthy) {
      throw 'Agent task was registered but the loopback health endpoint did not become ready.'
    }
  }

  if (Test-Path -LiteralPath $backupAgent) { Remove-Item -LiteralPath $backupAgent -Force }
  Write-Host 'EKODI POS Agent install/upgrade complete.' -ForegroundColor Green
  Write-Host "Install directory: $InstallDir"
  Write-Host "Scheduled task: $TaskName"
  Write-Host "Config preserved at: $targetConfig"
  Write-Host "Task Scheduler compatibility: $InstallerCompatibility ($registrationMode)"
  Write-Host 'Foreground switching remains explicit-user-action only.'
} catch {
  if (Test-Path -LiteralPath $backupAgent) {
    Copy-Item -LiteralPath $backupAgent -Destination $targetAgent -Force
    Remove-Item -LiteralPath $backupAgent -Force
  } elseif (-not $hadAgent -and (Test-Path -LiteralPath $targetAgent)) {
    Remove-Item -LiteralPath $targetAgent -Force
  }
  if ($existingTask) {
    try { Start-ScheduledTask -TaskName $TaskName } catch {}
  }
  throw
} finally {
  if (Test-Path -LiteralPath $candidateAgent) { Remove-Item -LiteralPath $candidateAgent -Force }
}
) {
    throw 'listenerPrefix must remain loopback-only.'
  }
  if (-not @($cfg.allowedOrigins).Contains('https://ekodi.kr')) {
    throw 'allowedOrigins must include https://ekodi.kr.'
  }
  return $cfg
}

function Test-TaskSchemaRangeError($ErrorRecord) {
  $inner = ''
  if ($null -ne $ErrorRecord.Exception.InnerException) {
    $inner = [string]$ErrorRecord.Exception.InnerException.Message
  }
  $text = @(
    [string]$ErrorRecord.FullyQualifiedErrorId,
    [string]$ErrorRecord.Exception.Message,
    $inner,
    [string]($ErrorRecord | Out-String)
  ) -join "`n"
  return (
    $ErrorRecord.Exception.HResult -eq -2147216616 -or
    $text -match '0x80041318|XML.*범위|XML.*out of range|formatted or out of range|task XML.*out of range'
  )
}

if (-not (Test-IsAdministrator)) {
  throw 'Administrator privileges are required to install the EKODI POS Agent scheduled task.'
}

$sourceAgent = Join-Path $PSScriptRoot 'EKODI-POS-Agent.ps1'
$sourceConfig = Join-Path $PSScriptRoot 'pos-agent.config.example.json'
if (-not (Test-Path -LiteralPath $sourceAgent)) { throw "Agent source missing: $sourceAgent" }
if (-not (Test-Path -LiteralPath $sourceConfig)) { throw "Config example missing: $sourceConfig" }

New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
$candidateAgent = Join-Path $InstallDir 'EKODI-POS-Agent.candidate.ps1'
$targetAgent = Join-Path $InstallDir 'EKODI-POS-Agent.ps1'
$targetConfig = Join-Path $InstallDir 'pos-agent.config.json'
$backupAgent = Join-Path $InstallDir 'EKODI-POS-Agent.rollback.ps1'

Copy-Item -LiteralPath $sourceAgent -Destination $candidateAgent -Force
Validate-PowerShellFile $candidateAgent
if (-not (Test-Path -LiteralPath $targetConfig)) {
  Copy-Item -LiteralPath $sourceConfig -Destination $targetConfig
}
$config = Read-AgentConfig $targetConfig

$existingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
$hadAgent = Test-Path -LiteralPath $targetAgent
if ($hadAgent) { Copy-Item -LiteralPath $targetAgent -Destination $backupAgent -Force }

try {
  if ($existingTask) {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 250
  }

  Move-Item -LiteralPath $candidateAgent -Destination $targetAgent -Force

  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $userName = $identity.Name
  $arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$targetAgent`" -ConfigPath `"$targetConfig`""
  $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arguments
  $trigger = New-ScheduledTaskTrigger -AtLogOn -User $userName
  $principal = New-ScheduledTaskPrincipal -UserId $userName -LogonType Interactive -RunLevel Highest
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
  try {
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
  } catch {
    if ($_.Exception.HResult -eq -2147216616 -or $_.Exception.Message -match '0x80041318|XML.*범위|XML.*out of range|formatted or out of range') {
      Write-Host 'Task Scheduler rejected the restart interval. Retrying with compatibility-safe settings.' -ForegroundColor Yellow
      $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero)
      Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
    } else {
      throw
    }
  }

  if (-not $NoStart) {
    Start-ScheduledTask -TaskName $TaskName
    $store = @($config.allowedStores | Where-Object { $_ } | Select-Object -First 1)
    $headers = @{}
    if ($store.Count) { $headers['X-EKODI-Store'] = [string]$store[0] }
    $healthUrl = ([string]$config.listenerPrefix).TrimEnd('/') + '/v1/health'
    $healthy = $false
    for ($attempt = 1; $attempt -le 20; $attempt++) {
      Start-Sleep -Milliseconds 500
      try {
        $health = Invoke-RestMethod -Uri $healthUrl -Method Get -Headers $headers -TimeoutSec 2
        if ($health.ok) { $healthy = $true; break }
      } catch {}
    }
    if (-not $healthy) {
      throw 'Agent task was registered but the loopback health endpoint did not become ready.'
    }
  }

  if (Test-Path -LiteralPath $backupAgent) { Remove-Item -LiteralPath $backupAgent -Force }
  Write-Host 'EKODI POS Agent install/upgrade complete.' -ForegroundColor Green
  Write-Host "Install directory: $InstallDir"
  Write-Host "Scheduled task: $TaskName"
  Write-Host "Config preserved at: $targetConfig"
  Write-Host 'Foreground switching remains explicit-user-action only.'
} catch {
  if (Test-Path -LiteralPath $backupAgent) {
    Copy-Item -LiteralPath $backupAgent -Destination $targetAgent -Force
    Remove-Item -LiteralPath $backupAgent -Force
  } elseif (-not $hadAgent -and (Test-Path -LiteralPath $targetAgent)) {
    Remove-Item -LiteralPath $targetAgent -Force
  }
  if ($existingTask) {
    try { Start-ScheduledTask -TaskName $TaskName } catch {}
  }
  throw
} finally {
  if (Test-Path -LiteralPath $candidateAgent) { Remove-Item -LiteralPath $candidateAgent -Force }
}
