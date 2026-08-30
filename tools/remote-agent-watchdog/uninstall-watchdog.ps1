param(
  [string]$InstallDir = "$env:ProgramData\EKODI\RemoteAgentWatchdog",
  [string]$TaskName = 'EKODI Remote Agent Watchdog'
)

$ErrorActionPreference = 'Stop'
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Administrator privileges are required.'
}

foreach ($name in @($TaskName, "$TaskName Monitor")) {
  if (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $name -Confirm:$false
  }
}

if (Test-Path $InstallDir) { Remove-Item -Recurse -Force $InstallDir }
Write-Output "Removed: $TaskName"
