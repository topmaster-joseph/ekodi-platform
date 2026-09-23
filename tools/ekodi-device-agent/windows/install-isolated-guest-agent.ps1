param(
  [switch]$Install
)

$ErrorActionPreference='Stop'
$Source=Join-Path $PSScriptRoot 'ekodi-isolated-guest-agent.ps1'

if(-not $Install){
  Write-Host 'Use -Install inside the EKODI-Isolated-Base guest.'
  exit 0
}
if(-not (Test-Path -LiteralPath $Source)){ throw 'isolated_guest_agent_source_missing' }
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Source -Install
if($LASTEXITCODE -ne 0){ throw "isolated_guest_agent_install_failed:$LASTEXITCODE" }

$root=Join-Path $env:ProgramData 'EKODI\GuestAgent'
$agent=Join-Path $root 'ekodi-isolated-guest-agent.ps1'
if(-not (Test-Path -LiteralPath $agent)){ throw 'isolated_guest_agent_not_installed' }
$task=Get-ScheduledTask -TaskName 'EKODI Isolated Guest Agent' -ErrorAction Stop
if(-not $task){ throw 'isolated_guest_agent_task_missing' }
Write-Host 'EKODI isolated base guest agent provisioning complete.'
