# EKODI desktop inventory: read-only, no token or file contents collected.
[CmdletBinding()]
param(
  [string]$DesktopPath = [Environment]::GetFolderPath('Desktop'),
  [string]$OutputPath = ''
)
$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($DesktopPath) -or -not (Test-Path -LiteralPath $DesktopPath -PathType Container)) {
  throw 'Desktop directory not found.'
}
$items = @(Get-ChildItem -LiteralPath $DesktopPath -Force -ErrorAction Stop | Where-Object {
  $_.Name -match '(?i)ekodi|에코디'
} | ForEach-Object {
  [pscustomobject]@{
    name = $_.Name
    type = if ($_.PSIsContainer) { 'directory' } else { 'file' }
    isReparsePoint = [bool](($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0)
    lastWriteUtc = $_.LastWriteTimeUtc.ToString('o')
    sizeBytes = if ($_.PSIsContainer) { $null } else { $_.Length }
    suggestedAction = 'review-only'
  }
})
$report = [pscustomobject]@{
  schemaVersion = 1
  generatedUtc = (Get-Date).ToUniversalTime().ToString('o')
  mode = 'read-only'
  desktop = [IO.Path]::GetFullPath($DesktopPath)
  itemCount = $items.Count
  items = $items
}
$json = $report | ConvertTo-Json -Depth 5
if ($OutputPath) {
  $target = [IO.Path]::GetFullPath($OutputPath)
  if ([IO.Path]::GetExtension($target) -ne '.json') { throw 'Output must be .json' }
  if (Test-Path -LiteralPath $target) { throw 'Refusing to overwrite existing report' }
  $json | Set-Content -LiteralPath $target -Encoding UTF8 -NoNewline
} else {
  Write-Output $json
}
