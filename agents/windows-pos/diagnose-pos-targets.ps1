param(
  [switch]$Json,
  [switch]$Suggest
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

# Read-only keyword hints. These are candidates for a person to confirm, never
# an automatic production mapping; this script does not write any configuration.
$hints = [ordered]@{
  vpos = @('VPOS', 'POS', '테이블')
  mukkebi = @('먹깨비')
  ddangyo = @('땡겨요')
  naver_order = @('네이버', 'NAVER')
  smartcon = @('SMART CON', 'SMARTCON', '스마트콘')
  delivery = @('배달의민족', '배민', '쿠팡이츠', '요기요', '배달')
  takeout = @('포장')
  reservation = @('예약')
}
function Get-Suggestions {
  $out = @()
  foreach ($id in $hints.Keys) {
    foreach ($window in $windows) {
      $haystack = "$($window.processName) $($window.windowTitle)"
      $match = @($hints[$id] | Where-Object { $haystack.IndexOf($_, [StringComparison]::OrdinalIgnoreCase) -ge 0 })
      if ($match.Count) {
        $out += [pscustomobject]@{ target = $id; processName = $window.processName; windowTitle = $window.windowTitle; matched = ($match -join ', '); confirmed = $false }
      }
    }
  }
  return ,$out
}

if ($Json) {
  if ($Suggest) { [pscustomobject]@{ windows = $windows; suggestions = (Get-Suggestions); note = 'Candidates only. Confirm each mapping before editing pos-agent.config.json.' } | ConvertTo-Json -Depth 5 }
  else { $windows | ConvertTo-Json -Depth 4 }
  exit 0
}

Write-Host 'EKODI POS Agent target diagnostics' -ForegroundColor Cyan
Write-Host 'Copy the processName or a stable part of windowTitle into pos-agent.config.json.'
Write-Host 'No process is started, stopped, or focused by this diagnostic.'
Write-Host ''
$windows | Format-Table -AutoSize processName, pid, windowTitle
if ($Suggest) {
  Write-Host ''
  Write-Host 'Mapping candidates (confirm before use; nothing was written):' -ForegroundColor Yellow
  $suggestions = Get-Suggestions
  if (@($suggestions).Count) { $suggestions | Format-Table -AutoSize target, processName, windowTitle, matched }
  else { Write-Host 'No candidates found. Open the POS and order programs first, then run this again.' }
}
