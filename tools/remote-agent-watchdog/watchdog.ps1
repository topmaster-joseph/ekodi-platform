param(
  [string]$ProcessName = 'DesktopCommander',
  [string]$ExecutablePath = '',
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
  if (!(Test-Path $StatePath)) { return @{ restarts = @() } }
  try { return (Get-Content $StatePath -Raw | ConvertFrom-Json -AsHashtable) }
  catch { return @{ restarts = @() } }
}

function Save-State($State) {
  $State | ConvertTo-Json -Depth 5 | Set-Content -Path $StatePath -Encoding UTF8
}

function Resolve-AgentExecutable {
  if ($ExecutablePath -and (Test-Path $ExecutablePath)) { return $ExecutablePath }
  $proc = Get-Process -Name $ProcessName -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($proc -and $proc.Path) { return $proc.Path }
  $candidates = @(
    "$env:LOCALAPPDATA\Programs\Desktop Commander\DesktopCommander.exe",
    "$env:LOCALAPPDATA\Programs\DesktopCommander\DesktopCommander.exe",
    "$env:ProgramFiles\Desktop Commander\DesktopCommander.exe",
    "$env:ProgramFiles(x86)\Desktop Commander\DesktopCommander.exe"
  )
  return ($candidates | Where-Object { Test-Path $_ } | Select-Object -First 1)
}

$running = Get-Process -Name $ProcessName -ErrorAction SilentlyContinue
if ($running) { exit 0 }

$state = Load-State
$cutoff = (Get-Date).AddHours(-1)
$recent = @($state.restarts | ForEach-Object { try { [datetime]$_ } catch {} } | Where-Object { $_ -gt $cutoff })
if ($recent.Count -ge $MaxRestartsPerHour) {
  Write-WatchdogLog "restart suppressed: rate limit reached ($($recent.Count)/hour)"
  $state.restarts = @($recent | ForEach-Object { $_.ToString('o') })
  Save-State $state
  exit 2
}

$exe = Resolve-AgentExecutable
if (!$exe) {
  Write-WatchdogLog "agent executable not found"
  exit 3
}

try {
  Start-Process -FilePath $exe -WindowStyle Hidden
  $recent += Get-Date
  $state.restarts = @($recent | ForEach-Object { $_.ToString('o') })
  Save-State $state
  Write-WatchdogLog "agent restarted: $exe"
  exit 0
} catch {
  Write-WatchdogLog "agent restart failed: $($_.Exception.Message)"
  exit 4
}
