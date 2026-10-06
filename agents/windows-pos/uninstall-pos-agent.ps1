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

$startupLauncher = Join-Path ([Environment]::GetFolderPath([Environment+SpecialFolder]::Startup)) 'EKODI-POS-Agent-Startup.cmd'
if (Test-Path -LiteralPath $startupLauncher) {
  Remove-Item -LiteralPath $startupLauncher -Force
}

$modePath = Join-Path $InstallDir 'install-mode.txt'
if (Test-Path -LiteralPath $modePath) {
  $mode = (Get-Content -LiteralPath $modePath -Raw -ErrorAction SilentlyContinue).Trim()
  if ($mode -eq 'startup-folder') {
    & netsh.exe http delete urlacl 'url=http://127.0.0.1:17831/' *> $null
  }
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
