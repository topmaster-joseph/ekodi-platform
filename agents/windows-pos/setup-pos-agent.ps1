param(
  [string]$SourceBase = 'https://raw.githubusercontent.com/topmaster-joseph/ekodi-platform/main/agents/windows-pos'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Test-IsAdministrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Assert-TrustedSource([string]$Url) {
  $uri = [Uri]$Url
  if ($uri.Scheme -ne 'https') { throw 'Setup source must use HTTPS.' }
  if ($uri.Host -ne 'raw.githubusercontent.com') { throw 'Setup source host is not trusted.' }
  if (-not $uri.AbsolutePath.StartsWith('/topmaster-joseph/ekodi-platform/')) {
    throw 'Setup source repository is not trusted.'
  }
}

if (-not (Test-IsAdministrator)) {
  $args = @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"{0}"' -f $PSCommandPath))
  Start-Process -FilePath 'powershell.exe' -ArgumentList ($args -join ' ') -Verb RunAs
  exit
}

$stage = Join-Path $env:TEMP 'EKODI-POS-Agent-Setup'
if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
New-Item -ItemType Directory -Path $stage -Force | Out-Null

$files = @(
  'install-pos-agent.ps1',
  'EKODI-POS-Agent.ps1',
  'pos-agent.config.example.json',
  'diagnose-pos-targets.ps1',
  'start-pos-agent.cmd',
  'stop-pos-agent.cmd',
  'uninstall-pos-agent.ps1'
)

try {
  foreach ($file in $files) {
    $url = $SourceBase.TrimEnd('/') + '/' + $file
    Assert-TrustedSource $url
    $destination = Join-Path $stage $file
    Write-Host "Downloading $file ..."
    Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $destination
    if (-not (Test-Path -LiteralPath $destination)) { throw "Download failed: $file" }
  }

  $parserErrors = $null
  $tokens = $null
  [void][System.Management.Automation.Language.Parser]::ParseFile((Join-Path $stage 'install-pos-agent.ps1'), [ref]$tokens, [ref]$parserErrors)
  if ($parserErrors.Count -gt 0) { throw "Installer syntax check failed: $($parserErrors[0].Message)" }

  $cfg = Get-Content -LiteralPath (Join-Path $stage 'pos-agent.config.example.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  if ([string]$cfg.listenerPrefix -notmatch '^http://(127\.0\.0\.1|localhost):\d+/$') {
    throw 'Downloaded config failed loopback-only validation.'
  }
  if (-not @($cfg.allowedOrigins).Contains('https://ekodi.kr')) {
    throw 'Downloaded config failed origin validation.'
  }

  Write-Host ''
  Write-Host 'Installing EKODI POS Agent...' -ForegroundColor Cyan
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $stage 'install-pos-agent.ps1')
  if ($LASTEXITCODE -ne 0) { throw "Installer exited with code $LASTEXITCODE" }

  Write-Host ''
  Write-Host 'EKODI POS Agent setup complete.' -ForegroundColor Green
  Write-Host 'Open your EKODI POS admin page and press Agent status check.'
  Start-Process 'https://ekodi.kr/cmpmyi/admin/panel/pos'
} catch {
  Write-Host ''
  Write-Host $_.Exception.Message -ForegroundColor Red
  Write-Host 'Setup did not complete. No arbitrary program or network endpoint was used.' -ForegroundColor Yellow
  throw
} finally {
  Write-Host ''
  Write-Host 'Press Enter to close.'
  [void](Read-Host)
}
