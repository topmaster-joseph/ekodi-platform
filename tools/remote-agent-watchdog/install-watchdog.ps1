param(
  [string]$InstallDir = "$env:ProgramData\EKODI\RemoteAgentWatchdog",
  [string]$TaskName = 'EKODI Remote Agent Watchdog',
  [string]$ProcessName = 'DesktopCommander',
  [string]$ExecutablePath = ''
)

$ErrorActionPreference = 'Stop'
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Administrator privileges are required.'
}

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
$source = Join-Path $PSScriptRoot 'watchdog.ps1'
$target = Join-Path $InstallDir 'watchdog.ps1'
Copy-Item -Force $source $target

$args = @('-NoProfile','-ExecutionPolicy','Bypass','-File',"`"$target`"",'-ProcessName',"`"$ProcessName`"")
if ($ExecutablePath) { $args += @('-ExecutablePath',"`"$ExecutablePath`"") }
$argumentString = $args -join ' '

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $argumentString
$triggers = @(
  (New-ScheduledTaskTrigger -AtStartup),
  (New-ScheduledTaskTrigger -AtLogOn)
)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 2)
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $triggers -Settings $settings -Principal $principal -Force | Out-Null

$repeatAction = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $argumentString
$repeatTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 2) -RepetitionDuration (New-TimeSpan -Days 3650)
Register-ScheduledTask -TaskName "$TaskName Monitor" -Action $repeatAction -Trigger $repeatTrigger -Settings $settings -Principal $principal -Force | Out-Null

Start-ScheduledTask -TaskName $TaskName
Write-Output "Installed: $TaskName"
Write-Output "Monitor interval: 2 minutes"
Write-Output "Install directory: $InstallDir"
