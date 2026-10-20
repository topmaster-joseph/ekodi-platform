# Read-only planning. Never moves or deletes desktop content.
[CmdletBinding()]
param([string]$DesktopPath = [Environment]::GetFolderPath('Desktop'))
$ErrorActionPreference = 'Stop'
if (-not $DesktopPath -or -not (Test-Path -LiteralPath $DesktopPath -PathType Container)) { throw 'Desktop not found' }
$base = [IO.Path]::GetFullPath($DesktopPath)
$items = @(Get-ChildItem -LiteralPath $base -Force | Where-Object { $_.Name -match '(?i)ekodi|에코디' -and $_.Name -ne 'EKODI 통합관리' } | Select-Object -First 100 | ForEach-Object {
  $linked = [bool](($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0)
  $candidate = if ($linked) { 'manual-review-link' } elseif ($_.PSIsContainer) { 'verify-runtime-references' } else { 'verify-contents-and-backup' }
  [pscustomobject]@{ name = $_.Name; kind = if ($_.PSIsContainer) { 'directory' } else { 'file' }; classification = $candidate; moveApproved = $false; deleteApproved = $false }
})
[pscustomobject]@{ schemaVersion = 1; mode = 'dry-run'; targetFolderName = 'EKODI 통합관리'; sourceDesktop = $base; candidates = $items; mutationCount = 0 } | ConvertTo-Json -Depth 5
