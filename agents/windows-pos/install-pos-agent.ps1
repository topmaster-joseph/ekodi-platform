param(
  [string]$InstallDir = "$env:ProgramData\EKODI\POSAgent",
  [string]$TaskName = 'EKODI POS Agent',
  [switch]$NoStart
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
# EKODI_POS_INSTALLER_COMPAT=task-scheduler-0x80041318-v4
$InstallerCompatibility = 'task-scheduler-0x80041318-v4'

function Test-IsAdministrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
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
  if ($prefix -notmatch '^http://(127\.0\.0\.1|localhost):\d+/$') {
    throw 'listenerPrefix must remain loopback-only.'
  }
  if (-not @($cfg.allowedOrigins).Contains('https://ekodi.kr')) {
    throw 'allowedOrigins must include https://ekodi.kr.'
  }
  return $cfg
}

function Test-TaskSchemaRangeError($ErrorRecord) {
  $text = @(
    [string]$ErrorRecord.FullyQualifiedErrorId,
    [string]$ErrorRecord.Exception.Message,
    [string]($ErrorRecord | Out-String)
  ) -join "`n"
  return (
    $ErrorRecord.Exception.HResult -eq -2147216616 -or
    $text -match '0x80041318|SCHED_E_INVALIDVALUE|XML.*범위|XML.*out of range|formatted or out of range|task XML.*out of range'
  )
}

function Register-EkodiScheduledTask {
  param(
    [string]$Name,
    $Action,
    $Trigger,
    $Principal
  )

  # Compatibility-first: the plain Windows default settings profile avoids
  # serializing restart/time-limit values that older Task Scheduler versions
  # reject with HRESULT 0x80041318.
  try {
    Register-ScheduledTask -TaskName $Name -Action $Action -Trigger $Trigger -Principal $Principal -Force | Out-Null
    return 'default-settings'
  } catch {
    if (-not (Test-TaskSchemaRangeError $_)) { throw }
    Write-Host 'Task Scheduler rejected the default task XML; retrying with an explicit minimal settings profile.' -ForegroundColor Yellow
    $defaultError = $_
  }

  try {
    $minimalSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable
    Register-ScheduledTask -TaskName $Name -Action $Action -Trigger $Trigger -Principal $Principal -Settings $minimalSettings -Force | Out-Null
    return 'minimal-settings'
  } catch {
    if (-not (Test-TaskSchemaRangeError $_)) { throw }
    Write-Host 'Task Scheduler rejected the minimal settings profile; retrying without RunLevel Highest for compatibility.' -ForegroundColor Yellow
  }

  # Some vendor POS images ship an older Task Scheduler schema that rejects
  # the Highest run-level principal XML. Keep the task interactive and scoped
  # to the current user, but allow the scheduler's default run level as a
  # last-resort compatibility path. The Agent itself remains loopback-only.
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $fallbackPrincipal = New-ScheduledTaskPrincipal -UserId $identity.Name -LogonType Interactive
  try {
    Register-ScheduledTask -TaskName $Name -Action $Action -Trigger $Trigger -Principal $fallbackPrincipal -Force | Out-Null
    return 'interactive-default-runlevel'
  } catch {
    if (Test-TaskSchemaRangeError $_) {
      Write-Host 'Task Scheduler still rejected the compatibility task XML.' -ForegroundColor Red
      throw $defaultError
    }
    throw
  }
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
if ($hadAgent) {
  Copy-Item -LiteralPath $targetAgent -Destination $backupAgent -Force
}

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

  $registrationMode = Register-EkodiScheduledTask -Name $TaskName -Action $action -Trigger $trigger -Principal $principal

  $registeredTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
  if (-not $registeredTask) {
    throw 'Agent scheduled task registration could not be verified.'
  }

  if (-not $NoStart) {
    Start-ScheduledTask -TaskName $TaskName
    $store = @($config.allowedStores | Where-Object { $_ } | Select-Object -First 1)
    $headers = @{}
    if ($store.Count) {
      $headers['X-EKODI-Store'] = [string]$store[0]
    }
    $healthUrl = ([string]$config.listenerPrefix).TrimEnd('/') + '/v1/health'
    $healthy = $false
    for ($attempt = 1; $attempt -le 20; $attempt++) {
      Start-Sleep -Milliseconds 500
      try {
        $health = Invoke-RestMethod -Uri $healthUrl -Method Get -Headers $headers -TimeoutSec 2
        if ($health.ok) {
          $healthy = $true
          break
        }
      } catch {}
    }
    if (-not $healthy) {
      throw 'Agent task was registered but the loopback health endpoint did not become ready.'
    }
  }

  if (Test-Path -LiteralPath $backupAgent) {
    Remove-Item -LiteralPath $backupAgent -Force
  }

  Write-Host 'EKODI POS Agent install/upgrade complete.' -ForegroundColor Green
  Write-Host "Install directory: $InstallDir"
  Write-Host "Scheduled task: $TaskName"
  Write-Host "Config preserved at: $targetConfig"
  Write-Host "Task Scheduler compatibility: $InstallerCompatibility ($registrationMode)"
  if ($registrationMode -eq 'interactive-default-runlevel') {
    Write-Host 'Compatibility mode used: interactive current-user task with the Windows default run level.' -ForegroundColor Yellow
  }
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
  } else {
    # A failed first-time registration must not leave a partial task behind.
    try {
      $partialTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
      if ($partialTask) { Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue }
    } catch {}
  }
  throw
} finally {
  if (Test-Path -LiteralPath $candidateAgent) {
    Remove-Item -LiteralPath $candidateAgent -Force
  }
}
