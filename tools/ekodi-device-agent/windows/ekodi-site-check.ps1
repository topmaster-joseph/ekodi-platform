# EKODI-SITE-CHECK-001 · 로컬 PC 사이트 점검 표준 도구
# ---------------------------------------------------------------------------
# 목적: AI(Claude·Codex·GPT·EKODI Orchestrator)가 로컬 PC에서 사이트를 점검할 때
#       사용자의 기본 브라우저(Opera/Chrome/Edge 개인 프로필)에 창·탭을 남기지 않는다.
#
# 기본: 백그라운드(headless) 실행 → 화면에 아무 창도 뜨지 않음.
# -Visible: 꼭 눈으로 봐야 할 때만. EKODI 전용 임시 프로필의 별도 창을 열고
#           -AutoCloseSeconds(기본 60초, 최대 600초) 뒤 자동 종료 + 프로필 삭제.
#
# 금지: Start-Process <URL>, cmd /c start <URL>, explorer <URL> 등 기본 브라우저 호출.
#       사용자 브라우저 프로필·쿠키·탭은 절대 건드리지 않는다.
#
# 사용 예:
#   powershell -NoProfile -ExecutionPolicy Bypass -File ekodi-site-check.ps1 -Url https://ekodi.kr/ekodimall/
#   ... -Url https://ekodi.kr/ -Url https://ekodi.kr/books -Screenshot
#   ... -Url https://ekodi.kr/admin -Visible -AutoCloseSeconds 45
# ---------------------------------------------------------------------------
param(
  [Parameter(Mandatory = $true)][string[]]$Url,
  [switch]$Visible,
  [ValidateRange(5, 600)][int]$AutoCloseSeconds = 60,
  [ValidateRange(5, 120)][int]$TimeoutSeconds = 30,
  [switch]$Screenshot,
  [ValidateSet('desktop', 'mobile')][string]$Device = 'desktop'
)

$ErrorActionPreference = 'Stop'
$PolicyId = 'EKODI-SITE-CHECK-001'
$Root = Join-Path $env:ProgramData 'EKODI\SiteCheck'
$OutRoot = Join-Path $Root 'results'
New-Item -ItemType Directory -Path $OutRoot -Force | Out-Null

function Resolve-EkodiCheckBrowser {
  # Opera는 사용자 개인 브라우저이므로 의도적으로 제외한다.
  $candidates = @(
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
  )
  return ($candidates | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1)
}

function Assert-SafeHttpUrl([string]$Value) {
  $uri = $null
  if (-not [Uri]::TryCreate($Value, [UriKind]::Absolute, [ref]$uri)) { throw "invalid_url: $Value" }
  if ($uri.Scheme -notin @('https', 'http')) { throw "unsupported_url_scheme: $Value" }
  if ($uri.UserInfo) { throw 'url_userinfo_forbidden' }
  return $uri.AbsoluteUri
}

function New-OwnedProfile {
  $dir = Join-Path $Root ('profile-' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $dir -Force | Out-Null
  return $dir
}

# EKODI가 연 프로세스만 정리: 임시 프로필 경로가 명령줄에 있는 프로세스만 종료한다.
function Stop-OwnedBrowserTree([string]$ProfileDir) {
  $escaped = [regex]::Escape($ProfileDir)
  for ($i = 0; $i -lt 3; $i++) {
    $owned = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -in @('msedge.exe', 'chrome.exe') -and [string]$_.CommandLine -match $escaped })
    if ($owned.Count -eq 0) { return $true }
    foreach ($p in $owned) { try { Stop-Process -Id ([int]$p.ProcessId) -Force -ErrorAction Stop } catch { } }
    Start-Sleep -Milliseconds 500
  }
  return (@(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
      Where-Object { [string]$_.CommandLine -match $escaped }).Count -eq 0)
}

function Remove-OwnedProfile([string]$ProfileDir) {
  for ($i = 0; $i -lt 5; $i++) {
    try { Remove-Item -LiteralPath $ProfileDir -Recurse -Force -ErrorAction Stop; return $true } catch { Start-Sleep -Milliseconds 400 }
  }
  return $false
}

function Get-CommonArgs([string]$ProfileDir) {
  $size = if ($Device -eq 'mobile') { '390,844' } else { '1440,900' }
  return @(
    "--user-data-dir=`"$ProfileDir`"",
    '--no-first-run', '--no-default-browser-check', '--disable-sync',
    '--disable-extensions', '--disable-background-networking',
    '--disable-features=Translate,MediaRouter', "--window-size=$size"
  )
}

function Invoke-HeadlessCheck([string]$Browser, [string]$Target) {
  $profileDir = New-OwnedProfile
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $shot = Join-Path $OutRoot ("shot-$stamp-" + ([guid]::NewGuid().ToString('N').Substring(0, 6)) + '.png')
  $started = Get-Date
  $result = [ordered]@{ url = $Target; mode = 'background'; ok = $false }
  try {
    # 1) HTTP 상태
    try {
      $resp = Invoke-WebRequest -Uri $Target -UseBasicParsing -MaximumRedirection 5 -TimeoutSec $TimeoutSeconds
      $result.httpStatus = [int]$resp.StatusCode
    } catch {
      $result.httpStatus = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { $null }
      $result.httpError = $_.Exception.Message
    }
    # 2) 실제 브라우저 렌더링(DOM) — 화면에 창이 뜨지 않음
    $browserArgs = @('--headless=new', '--disable-gpu', '--hide-scrollbars', '--virtual-time-budget=8000') + (Get-CommonArgs $profileDir)
    if ($Screenshot) { $browserArgs += "--screenshot=`"$shot`"" } else { $browserArgs += '--dump-dom' }
    $browserArgs += "`"$Target`""
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $Browser
    $psi.Arguments = ($browserArgs -join ' ')
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $proc = [System.Diagnostics.Process]::Start($psi)
    $stdoutTask = $proc.StandardOutput.ReadToEndAsync()
    $null = $proc.StandardError.ReadToEndAsync()
    if (-not $proc.WaitForExit($TimeoutSeconds * 1000)) { $result.renderError = 'render_timeout' }
    $dom = if ($stdoutTask.Wait(2000)) { [string]$stdoutTask.Result } else { '' }
    if ($Screenshot) {
      $result.screenshot = if (Test-Path -LiteralPath $shot) { $shot } else { $null }
    } else {
      $result.domBytes = $dom.Length
      $m = [regex]::Match($dom, '<title[^>]*>(.*?)</title>', 'Singleline,IgnoreCase')
      $result.title = if ($m.Success) { [System.Net.WebUtility]::HtmlDecode($m.Groups[1].Value.Trim()) } else { $null }
    }
    $rendered = if ($Screenshot) { [bool]$result.screenshot } else { $result.domBytes -gt 200 }
    $result.ok = ($result.httpStatus -ge 200 -and $result.httpStatus -lt 400 -and $rendered -and -not $result.renderError)
  } finally {
    $result.browserClosed = Stop-OwnedBrowserTree $profileDir
    $result.profileRemoved = Remove-OwnedProfile $profileDir
    $result.elapsedMs = [int]((Get-Date) - $started).TotalMilliseconds
  }
  return $result
}

function Invoke-VisibleCheck([string]$Browser, [string]$Target) {
  # 눈으로 확인이 꼭 필요한 경우만. 사용자 브라우저가 아닌 EKODI 전용 별도 창.
  $profileDir = New-OwnedProfile
  $result = [ordered]@{ url = $Target; mode = 'visible-autoclose'; autoCloseSeconds = $AutoCloseSeconds; ok = $false }
  try {
    $browserArgs = @("--app=`"$Target`"", '--new-window') + (Get-CommonArgs $profileDir)
    $proc = Start-Process -FilePath $Browser -ArgumentList $browserArgs -PassThru
    $result.opened = [bool]$proc
    Start-Sleep -Seconds $AutoCloseSeconds
    $result.ok = $true
  } finally {
    # 성공·실패·중단(Ctrl+C) 어느 경우든 반드시 닫는다.
    $result.browserClosed = Stop-OwnedBrowserTree $profileDir
    $result.profileRemoved = Remove-OwnedProfile $profileDir
  }
  return $result
}

$browser = Resolve-EkodiCheckBrowser
if (-not $browser) { throw 'supported_browser_not_found (Edge 또는 Chrome 필요)' }

$results = @()
foreach ($u in $Url) {
  $safe = Assert-SafeHttpUrl $u
  $results += if ($Visible) { Invoke-VisibleCheck $browser $safe } else { Invoke-HeadlessCheck $browser $safe }
}

# 이전 실행에서 남은 임시 프로필·오래된 결과 정리(24시간 경과분)
Get-ChildItem -LiteralPath $Root -Directory -Filter 'profile-*' -ErrorAction SilentlyContinue |
  Where-Object { $_.LastWriteTime -lt (Get-Date).AddHours(-1) } |
  ForEach-Object { [void](Stop-OwnedBrowserTree $_.FullName); [void](Remove-OwnedProfile $_.FullName) }
Get-ChildItem -LiteralPath $OutRoot -File -ErrorAction SilentlyContinue |
  Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-1) } | Remove-Item -Force -ErrorAction SilentlyContinue

$report = [ordered]@{
  policy = $PolicyId
  checkedAt = (Get-Date).ToString('o')
  browser = [IO.Path]::GetFileName($browser)
  userBrowserTouched = $false
  allOk = (@($results | Where-Object { -not $_.ok }).Count -eq 0)
  results = $results
}
$json = $report | ConvertTo-Json -Depth 5
Set-Content -LiteralPath (Join-Path $OutRoot 'last.json') -Value $json -Encoding UTF8
$json
if (-not $report.allOk) { exit 1 }
