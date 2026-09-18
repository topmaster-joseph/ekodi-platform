param(
  [Parameter(Mandatory = $true)][string]$NpxPath,
  [Parameter(Mandatory = $true)][string]$AgentHome,
  [string]$AgentPackage = '@wonderwhy-er/desktop-commander@latest',
  [int]$MinBackoffSeconds = 10,
  [int]$MaxBackoffSeconds = 300,
  [string]$LogPath = "$env:ProgramData\EKODI\remote-agent-watchdog.log",
  [string]$StdoutPath = "$env:ProgramData\EKODI\remote-agent-console.log",
  [string]$StderrPath = "$env:ProgramData\EKODI\remote-agent-error.log"
)

$ErrorActionPreference = 'Stop'
$logDir = Split-Path -Parent $LogPath
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Write-WatchdogLog([string]$Message) {
  $line = "$(Get-Date -Format o) $Message"
  Add-Content -Path $LogPath -Value $line -Encoding UTF8
}

if (!(Test-Path $NpxPath)) {
  Write-WatchdogLog "fatal: npx not found at $NpxPath"
  exit 10
}
if (!(Test-Path $AgentHome)) {
  Write-WatchdogLog "fatal: agent home not found at $AgentHome"
  exit 11
}

$deviceConfig = Join-Path $AgentHome '.desktop-commander-device\device.json'
if (!(Test-Path $deviceConfig)) {
  Write-WatchdogLog "fatal: paired device config missing at $deviceConfig"
  exit 12
}

$env:USERPROFILE = $AgentHome
$env:HOME = $AgentHome
$drive = [IO.Path]::GetPathRoot($AgentHome).TrimEnd('\')
$env:HOMEDRIVE = $drive
$env:HOMEPATH = $AgentHome.Substring($drive.Length)

$backoff = [Math]::Max(5, $MinBackoffSeconds)
Write-WatchdogLog "supervisor started for $env:USERNAME; home=$AgentHome; npx=$NpxPath"

while ($true) {
  $startedAt = Get-Date
  try {
    Write-WatchdogLog "starting remote agent: $AgentPackage remote"
    $process = Start-Process `
      -FilePath $NpxPath `
      -ArgumentList @('-y', $AgentPackage, 'remote') `
      -WorkingDirectory $AgentHome `
      -RedirectStandardOutput $StdoutPath `
      -RedirectStandardError $StderrPath `
      -NoNewWindow `
      -PassThru `
      -Wait

    $runtime = [int]((Get-Date) - $startedAt).TotalSeconds
    Write-WatchdogLog "remote agent exited: code=$($process.ExitCode), runtime=${runtime}s"

    if ($runtime -ge 900) {
      $backoff = [Math]::Max(5, $MinBackoffSeconds)
    } else {
      $backoff = [Math]::Min($MaxBackoffSeconds, [Math]::Max($MinBackoffSeconds, $backoff * 2))
    }
  } catch {
    Write-WatchdogLog "remote agent launch failed: $($_.Exception.Message)"
    $backoff = [Math]::Min($MaxBackoffSeconds, [Math]::Max($MinBackoffSeconds, $backoff * 2))
  }

  Write-WatchdogLog "retrying in ${backoff}s"
  Start-Sleep -Seconds $backoff
}
