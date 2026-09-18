param(
  [string]$TaskName = 'EKODI Remote Agent Watchdog',
  [string]$LogPath = "$env:ProgramData\EKODI\remote-agent-watchdog.log",
  [string]$ConsoleLogPath = "$env:ProgramData\EKODI\remote-agent-console.log",
  [int]$TailLines = 30
)

$ErrorActionPreference = 'SilentlyContinue'
$result = [ordered]@{
  checked_at = (Get-Date).ToString('o')
  computer = $env:COMPUTERNAME
  user = $env:USERNAME
  node = $null
  npx = $null
  task_exists = $false
  task_state = $null
  task_last_result = $null
  remote_processes = 0
  paired_device_config = $false
  watchdog_log = @()
  console_log = @()
}

$result.node = (& node --version 2>$null)
$result.npx = (Get-Command npx.cmd -ErrorAction SilentlyContinue).Source
if (!$result.npx) { $result.npx = (Get-Command npx -ErrorAction SilentlyContinue).Source }

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($task) {
  $result.task_exists = $true
  $result.task_state = $task.State.ToString()
  $info = Get-ScheduledTaskInfo -TaskName $TaskName -ErrorAction SilentlyContinue
  if ($info) { $result.task_last_result = $info.LastTaskResult }
}

$remote = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
  $_.CommandLine -and $_.CommandLine -match '@wonderwhy-er/desktop-commander' -and $_.CommandLine -match '\bremote\b'
}
$result.remote_processes = @($remote).Count
$result.paired_device_config = Test-Path (Join-Path $env:USERPROFILE '.desktop-commander-device\device.json')

if (Test-Path $LogPath) { $result.watchdog_log = @(Get-Content $LogPath -Tail $TailLines) }
if (Test-Path $ConsoleLogPath) { $result.console_log = @(Get-Content $ConsoleLogPath -Tail $TailLines) }

$result | ConvertTo-Json -Depth 5

if (!$result.node -or !$result.npx) { exit 20 }
if (!$result.paired_device_config) { exit 21 }
if (!$result.task_exists) { exit 22 }
if ($result.task_state -ne 'Running') { exit 23 }
if ($result.remote_processes -lt 1) { exit 24 }
exit 0
