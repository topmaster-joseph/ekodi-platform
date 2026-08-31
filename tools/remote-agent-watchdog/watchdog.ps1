param(
  [string]$RunnerPath = "$env:ProgramData\EKODI\RemoteAgentWatchdog\remote-agent-runner.cmd",
  [int]$MaxRestartsPerHour = 6,
  [string]$StatePath = "$env:ProgramData\EKODI\remote-agent-watchdog.json",
  [string]$LogPath = "$env:ProgramData\EKODI\remote-agent-watchdog.log"
)

$ErrorActionPreference = 'Stop'
$dir = Split-Path -Parent $StatePath
New-Item -ItemType Directory -Force -Path $dir | Out-Null

function Write-WatchdogLog([string]$Message) {
  $line = "$(Get-Date -Format o) $Message"
  Add-Content -Path $LogPath -Value $line -Encoding UTF8
}

function Load-State {
  if (!(Test-Path $StatePath)) {
    return [pscustomobject]@{ restarts = @() }
  }

  try {
    $state = Get-Content $StatePath -Raw | ConvertFrom-Json
    if ($null -eq $state.restarts) {
      $state | Add-Member -NotePropertyName restarts -NotePropertyValue @()
    }
    return $state
  } catch {
    Write-WatchdogLog "state reset: $($_.Exception.Message)"
    return [pscustomobject]@{ restarts = @() }
  }
}

function Save-State($State) {
  $State | ConvertTo-Json -Depth 5 | Set-Content -Path $StatePath -Encoding UTF8
}

function Test-AgentRunning {
  $marker = [regex]::Escape($RunnerPath)
  $processes = Get-CimInstance Win32_Process -Filter "Name='cmd.exe'" -ErrorAction SilentlyContinue
  return [bool]($processes | Where-Object { $_.CommandLine -and $_.CommandLine -match $marker } | Select-Object -First 1)
}

if (Test-AgentRunning) { exit 0 }

if (!(Test-Path $RunnerPath)) {
  Write-WatchdogLog "runner not found: $RunnerPath"
  exit 3
}

$state = Load-State
$cutoff = (Get-Date).AddHours(-1)
$recent = @($state.restarts | ForEach-Object { try { [datetime]$_ } catch {} } | Where-Object { $_ -gt $cutoff })

if ($recent.Count -ge $MaxRestartsPerHour) {
  Write-WatchdogLog "restart suppressed: rate limit reached ($($recent.Count)/hour)"
  $state.restarts = @($recent | ForEach-Object { $_.ToString('o') })
  Save-State $state
  exit 2
}

try {
  $arguments = "/d /s /c `"$RunnerPath`""
  Start-Process -FilePath $env:ComSpec -ArgumentList $arguments -WindowStyle Hidden
  Start-Sleep -Seconds 3

  if (!(Test-AgentRunning)) {
    Write-WatchdogLog "agent launch returned but runner is not persistent"
    exit 4
  }

  $recent += Get-Date
  $state.restarts = @($recent | ForEach-Object { $_.ToString('o') })
  Save-State $state
  Write-WatchdogLog "remote agent restarted for user $env:USERNAME"
  exit 0
} catch {
  Write-WatchdogLog "agent restart failed: $($_.Exception.Message)"
  exit 4
}
