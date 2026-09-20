param(
  [string]$Url = 'https://ekodi.kr/',
  [int]$TimeoutSeconds = 25
)

$ErrorActionPreference = 'Stop'
$WorkerRoot = Join-Path $env:ProgramData 'EKODI\BrowserWorker'
$ProfileRoot = Join-Path $WorkerRoot 'CanaryProfile'

function Resolve-EkodiBrowser {
  $candidates = @(
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
  )
  return ($candidates | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1)
}

function Assert-SafeHttpUrl([string]$Value) {
  $uri = $null
  if (-not [Uri]::TryCreate($Value, [UriKind]::Absolute, [ref]$uri)) { throw 'invalid_url' }
  if ($uri.Scheme -notin @('https','http')) { throw 'unsupported_url_scheme' }
  if ($uri.UserInfo) { throw 'url_userinfo_forbidden' }
  if ($uri.Host -in @('localhost','127.0.0.1','::1')) { throw 'loopback_target_forbidden' }
  return $uri.AbsoluteUri
}

$browser = Resolve-EkodiBrowser
if (-not $browser) { throw 'supported_browser_not_found' }
$safeUrl = Assert-SafeHttpUrl $Url
New-Item -ItemType Directory -Path $ProfileRoot -Force | Out-Null

$arguments = @(
  '--headless=new',
  '--disable-gpu',
  '--disable-extensions',
  '--disable-sync',
  '--no-first-run',
  '--no-default-browser-check',
  "--user-data-dir=`"$ProfileRoot`"",
  '--dump-dom',
  "`"$safeUrl`""
) -join ' '

$process = [Diagnostics.Process]::new()
$process.StartInfo = [Diagnostics.ProcessStartInfo]@{
  FileName = $browser
  Arguments = $arguments
  UseShellExecute = $false
  CreateNoWindow = $true
  RedirectStandardOutput = $true
  RedirectStandardError = $true
}
[void]$process.Start()

$stdoutTask = $process.StandardOutput.ReadToEndAsync()
$stderrTask = $process.StandardError.ReadToEndAsync()
if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
  try { $process.Kill() } catch { }
  throw 'background_browser_timeout'
}
$stdout = $stdoutTask.GetAwaiter().GetResult()
$stderr = $stderrTask.GetAwaiter().GetResult()

$result = @{
  ok = ($process.ExitCode -eq 0 -and $stdout.Length -gt 0)
  mode = 'background-browser-canary'
  browser = [IO.Path]::GetFileName($browser)
  url = $safeUrl
  exitCode = $process.ExitCode
  contentBytes = [Text.Encoding]::UTF8.GetByteCount($stdout)
  dedicatedAutomationProfile = $true
  offscreenOrHeadless = $true
  focusIsolated = $true
  clipboardShared = $false
  userInputInjection = $false
  profilePath = $ProfileRoot
  stderrSummary = $(if ($stderr) { $stderr.Substring(0, [Math]::Min(300, $stderr.Length)) } else { '' })
  checkedAt = (Get-Date).ToUniversalTime().ToString('o')
}
$result | ConvertTo-Json -Depth 5
if (-not $result.ok) { exit 2 }
