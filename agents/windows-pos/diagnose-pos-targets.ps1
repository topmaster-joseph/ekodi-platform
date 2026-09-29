param(
  [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$windows = @(Get-Process -ErrorAction SilentlyContinue | Where-Object {
  $_.MainWindowHandle -ne [IntPtr]::Zero -and -not [string]::IsNullOrWhiteSpace($_.MainWindowTitle)
} | Sort-Object ProcessName, MainWindowTitle | ForEach-Object {
  [pscustomobject]@{
    processName = $_.ProcessName
    pid = $_.Id
    windowTitle = $_.MainWindowTitle
  }
})

if ($Json) {
  $windows | ConvertTo-Json -Depth 4
  exit 0
}

Write-Host 'EKODI POS Agent target diagnostics' -ForegroundColor Cyan
Write-Host 'Copy the processName or a stable part of windowTitle into pos-agent.config.json.'
Write-Host 'No process is started, stopped, or focused by this diagnostic.'
Write-Host ''
$windows | Format-Table -AutoSize processName, pid, windowTitle
