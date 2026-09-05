param(
  [string]$InstallDir = "$env:ProgramData\EKODI\RemoteAgentWatchdog",
  [string]$TaskName = 'EKODI Remote Agent Watchdog',
  [string]$AgentUser = ([Security.Principal.WindowsIdentity]::GetCurrent().Name),
  [string]$AgentPackage = '@wonderwhy-er/desktop-commander@latest'
)

$ErrorActionPreference = 'Stop'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]$identity
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Administrator privileges are required.'
}

$account = New-Object Security.Principal.NTAccount($AgentUser)
$sid = $account.Translate([Security.Principal.SecurityIdentifier]).Value
$profileKey = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList\$sid"
$profilePath = (Get-ItemProperty -Path $profileKey -Name ProfileImagePath).ProfileImagePath
$profilePath = [Environment]::ExpandEnvironmentVariables($profilePath)
if (!(Test-Path $profilePath)) { throw "Profile path not found: $profilePath" }

$npx = Get-Command npx.cmd -ErrorAction SilentlyContinue
if (!$npx) { $npx = Get-Command npx -ErrorAction SilentlyContinue }
if (!$npx) { throw 'npx was not found. Install Node.js 18+ first.' }
$npxPath = $npx.Source

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
$source = Join-Path $PSScriptRoot 'watchdog.ps1'
$target = Join-Path $InstallDir 'watchdog.ps1'
Copy-Item -Force $source $target

$deviceConfig = Join-Path $profilePath '.desktop-commander-device\device.json'
if (!(Test-Path $deviceConfig)) {
  throw "Remote Desktop Commander is not paired for $AgentUser. Run 'npx $AgentPackage remote' once as that user and approve the device before installing the watchdog."
}

$arguments = @(
  '-NoProfile',
  '-ExecutionPolicy', 'Bypass',
  '-File', "`"$target`"",
  '-NpxPath', "`"$npxPath`"",
  '-AgentHome', "`"$profilePath`"",
  '-AgentPackage', "`"$AgentPackage`""
) -join ' '

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arguments
$triggers = @(
  (New-ScheduledTaskTrigger -AtStartup),
  (New-ScheduledTaskTrigger -AtLogOn -User $AgentUser)
)
$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -RestartCount 6 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -MultipleInstances IgnoreNew
$taskPrincipal = New-ScheduledTaskPrincipal -UserId $AgentUser -LogonType S4U -RunLevel Highest

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $triggers -Settings $settings -Principal $taskPrincipal -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName

Write-Output "Installed: $TaskName"
Write-Output "Agent user: $AgentUser"
Write-Output "Agent profile: $profilePath"
Write-Output "npx: $npxPath"
Write-Output "Device config: $deviceConfig"
Write-Output "Watchdog: $target"
