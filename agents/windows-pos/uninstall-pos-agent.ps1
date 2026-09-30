param(
  [string]$InstallDir = "$env:ProgramData\EKODI\POSAgent",
  [string]$TaskName = 'EKODI POS Agent',
  [switch]$KeepConfig
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Administrator privileges are required to uninstall the EKODI POS Agent.'
}

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

$configPath = Join-Path $InstallDir 'pos-agent.config.json'
$configBackup = $null
if ($KeepConfig -and (Test-Path -LiteralPath $configPath)) {
  $configBackup = Join-Path $env:TEMP ('ekodi-pos-config-' + [guid]::NewGuid().ToString('N') + '.json')
  Copy-Item -LiteralPath $configPath -Destination $configBackup
}
if (Test-Path -LiteralPath $InstallDir) { Remove-Item -LiteralPath $InstallDir -Recurse -Force }
if ($configBackup) {
  New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
  Move-Item -LiteralPath $configBackup -Destination $configPath
}

Write-Host 'EKODI POS Agent removed.' -ForegroundColor Green
if ($KeepConfig) { Write-Host "Configuration preserved at: $configPath" }
