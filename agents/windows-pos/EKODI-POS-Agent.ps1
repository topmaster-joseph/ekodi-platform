param(
  [string]$ConfigPath = (Join-Path $PSScriptRoot 'pos-agent.config.json')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$AgentVersion = '0.1.0'

Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class EkodiPosWindow {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
}
"@

function Has-Property($Object, [string]$Name) {
  return $null -ne $Object -and $Object.PSObject.Properties.Name -contains $Name
}

function Property-Value($Object, [string]$Name, $Default = $null) {
  if (Has-Property $Object $Name) { return $Object.$Name }
  return $Default
}

function As-StringArray($Value) {
  if ($null -eq $Value) { return @() }
  return @($Value | ForEach-Object { [string]$_ } | Where-Object { $_.Trim() })
}

if (-not (Test-Path -LiteralPath $ConfigPath)) {
  throw "EKODI POS Agent config not found: $ConfigPath. Copy pos-agent.config.example.json to pos-agent.config.json and edit it first."
}

$config = Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
$prefix = [string](Property-Value $config 'listenerPrefix' 'http://127.0.0.1:17831/')
if ($prefix -notmatch '^http://(127\.0\.0\.1|localhost):\d+/$') {
  throw 'listenerPrefix must bind only to 127.0.0.1 or localhost.'
}
$allowedOrigins = As-StringArray (Property-Value $config 'allowedOrigins' @('https://ekodi.kr'))
$allowedStores = As-StringArray (Property-Value $config 'allowedStores' @())
$targets = @(Property-Value $config 'targets' @())

function Test-Origin([string]$Origin) {
  if ([string]::IsNullOrWhiteSpace($Origin)) { return $false }
  return $allowedOrigins -contains $Origin
}

function Add-CorsHeaders($Response, [string]$Origin) {
  if (Test-Origin $Origin) {
    $Response.Headers['Access-Control-Allow-Origin'] = $Origin
    $Response.Headers['Vary'] = 'Origin'
  }
  $Response.Headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
  $Response.Headers['Access-Control-Allow-Headers'] = 'Content-Type, X-EKODI-Store'
  $Response.Headers['Access-Control-Allow-Private-Network'] = 'true'
  $Response.Headers['Cache-Control'] = 'no-store'
  $Response.Headers['X-Content-Type-Options'] = 'nosniff'
}

function Write-Json($Context, [int]$StatusCode, $Payload, [string]$Origin) {
  $json = $Payload | ConvertTo-Json -Depth 8 -Compress
  $bytes = [Text.Encoding]::UTF8.GetBytes($json)
  $Context.Response.StatusCode = $StatusCode
  $Context.Response.ContentType = 'application/json; charset=utf-8'
  $Context.Response.ContentEncoding = [Text.Encoding]::UTF8
  Add-CorsHeaders $Context.Response $Origin
  $Context.Response.ContentLength64 = $bytes.Length
  $Context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  $Context.Response.OutputStream.Close()
}

function Read-JsonBody($Request) {
  $reader = New-Object IO.StreamReader($Request.InputStream, $Request.ContentEncoding)
  try {
    $raw = $reader.ReadToEnd()
  } finally {
    $reader.Dispose()
  }
  if ([string]::IsNullOrWhiteSpace($raw)) { return @{} }
  return $raw | ConvertFrom-Json
}

function Find-Target([string]$Id) {
  return $targets | Where-Object { [string](Property-Value $_ 'id' '') -eq $Id } | Select-Object -First 1
}

function Find-TargetProcess($Target) {
  $processNames = As-StringArray (Property-Value $Target 'processNames' @())
  $titleNeedles = As-StringArray (Property-Value $Target 'windowTitleContains' @())
  $candidates = @()

  foreach ($name in $processNames) {
    $normalized = [IO.Path]::GetFileNameWithoutExtension($name)
    try { $candidates += @(Get-Process -Name $normalized -ErrorAction SilentlyContinue) } catch {}
  }

  if (-not $processNames.Count -and $titleNeedles.Count) {
    try { $candidates = @(Get-Process -ErrorAction SilentlyContinue) } catch { $candidates = @() }
  }

  $seen = @{}
  foreach ($process in $candidates) {
    if ($null -eq $process) { continue }
    if ($seen.ContainsKey([string]$process.Id)) { continue }
    $seen[[string]$process.Id] = $true
    try {
      if ($process.MainWindowHandle -eq [IntPtr]::Zero) { continue }
      $title = [string]$process.MainWindowTitle
      if ($titleNeedles.Count) {
        $matched = $false
        foreach ($needle in $titleNeedles) {
          if ($title.IndexOf($needle, [StringComparison]::OrdinalIgnoreCase) -ge 0) { $matched = $true; break }
        }
        if (-not $matched) { continue }
      }
      return $process
    } catch {}
  }
  return $null
}

function Target-IsConfigured($Target) {
  $processNames = As-StringArray (Property-Value $Target 'processNames' @())
  $titleNeedles = As-StringArray (Property-Value $Target 'windowTitleContains' @())
  $launchPath = [string](Property-Value $Target 'launchPath' '')
  return ($processNames.Count -gt 0 -or $titleNeedles.Count -gt 0 -or -not [string]::IsNullOrWhiteSpace($launchPath))
}

function Target-Status($Target) {
  $process = Find-TargetProcess $Target
  return [ordered]@{
    id = [string](Property-Value $Target 'id' '')
    label = [string](Property-Value $Target 'label' (Property-Value $Target 'id' ''))
    configured = [bool](Target-IsConfigured $Target)
    running = [bool]($null -ne $process)
    windowTitle = if ($null -ne $process) { [string]$process.MainWindowTitle } else { '' }
  }
}

function Focus-TargetProcess($Process) {
  if ($null -eq $Process -or $Process.MainWindowHandle -eq [IntPtr]::Zero) { return $false }
  $hWnd = $Process.MainWindowHandle
  if ([EkodiPosWindow]::IsIconic($hWnd)) {
    [void][EkodiPosWindow]::ShowWindowAsync($hWnd, 9)
    Start-Sleep -Milliseconds 80
  } else {
    [void][EkodiPosWindow]::ShowWindowAsync($hWnd, 5)
  }
  if ([EkodiPosWindow]::SetForegroundWindow($hWnd)) { return $true }
  try {
    $shell = New-Object -ComObject WScript.Shell
    return [bool]$shell.AppActivate($Process.Id)
  } catch {
    return $false
  }
}

function Test-StoreHeader($Request) {
  if (-not $allowedStores.Count) { return $true }
  $store = [string]$Request.Headers['X-EKODI-Store']
  return $allowedStores -contains $store
}

$listener = [Net.HttpListener]::new()
$listener.Prefixes.Add($prefix)

try {
  $listener.Start()
} catch {
  Write-Host ''
  Write-Host 'EKODI POS Agent could not start the loopback listener.' -ForegroundColor Red
  Write-Host "Prefix: $prefix"
  Write-Host 'If Windows reports Access denied, reserve this exact loopback URL once from an Administrator terminal, then run the agent as a normal user:' -ForegroundColor Yellow
  Write-Host "  netsh http add urlacl url=$prefix user=`"$env:USERDOMAIN\$env:USERNAME`""
  throw
}

Write-Host "EKODI POS Agent $AgentVersion" -ForegroundColor Green
Write-Host "Listening only on $prefix"
Write-Host 'Foreground switching occurs only after an explicit POST /v1/focus request from an allowed EKODI origin.'
Write-Host 'Press Ctrl+C to stop.'

try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    $request = $context.Request
    $origin = [string]$request.Headers['Origin']

    try {
      if ($request.HttpMethod -eq 'OPTIONS') {
        if (-not (Test-Origin $origin)) {
          Write-Json $context 403 @{ ok = $false; error = 'origin_not_allowed' } $origin
          continue
        }
        $context.Response.StatusCode = 204
        Add-CorsHeaders $context.Response $origin
        $context.Response.OutputStream.Close()
        continue
      }

      if ($request.Url.AbsolutePath -eq '/v1/health' -and $request.HttpMethod -eq 'GET') {
        if ($origin -and -not (Test-Origin $origin)) {
          Write-Json $context 403 @{ ok = $false; error = 'origin_not_allowed' } $origin
          continue
        }
        if (-not (Test-StoreHeader $request)) {
          Write-Json $context 403 @{ ok = $false; error = 'store_not_allowed' } $origin
          continue
        }
        $targetStatus = @($targets | ForEach-Object { Target-Status $_ })
        Write-Json $context 200 @{
          ok = $true
          version = $AgentVersion
          listener = 'loopback'
          focusMode = 'explicit_user_action_only'
          targets = $targetStatus
        } $origin
        continue
      }

      if ($request.Url.AbsolutePath -eq '/v1/focus' -and $request.HttpMethod -eq 'POST') {
        if (-not (Test-Origin $origin)) {
          Write-Json $context 403 @{ ok = $false; error = 'origin_not_allowed' } $origin
          continue
        }
        if (-not (Test-StoreHeader $request)) {
          Write-Json $context 403 @{ ok = $false; error = 'store_not_allowed' } $origin
          continue
        }

        $body = Read-JsonBody $request
        $targetId = [string](Property-Value $body 'target' '')
        if ($targetId -notmatch '^[a-z0-9_-]{1,64}$') {
          Write-Json $context 400 @{ ok = $false; error = 'invalid_target' } $origin
          continue
        }

        $target = Find-Target $targetId
        if ($null -eq $target -or -not (Target-IsConfigured $target)) {
          Write-Json $context 409 @{ ok = $false; error = 'target_not_configured'; target = $targetId } $origin
          continue
        }

        $process = Find-TargetProcess $target
        $started = $false
        if ($null -eq $process) {
          $allowLaunch = [bool](Property-Value $target 'allowLaunch' $false)
          $launchPath = [string](Property-Value $target 'launchPath' '')
          if (-not $allowLaunch -or [string]::IsNullOrWhiteSpace($launchPath) -or -not (Test-Path -LiteralPath $launchPath)) {
            Write-Json $context 409 @{ ok = $false; error = 'target_not_running'; target = $targetId } $origin
            continue
          }

          Start-Process -FilePath $launchPath | Out-Null
          $started = $true
          $waitMs = [Math]::Min([Math]::Max([int](Property-Value $target 'launchWaitMs' 6000), 500), 15000)
          $deadline = [DateTime]::UtcNow.AddMilliseconds($waitMs)
          do {
            Start-Sleep -Milliseconds 250
            $process = Find-TargetProcess $target
          } while ($null -eq $process -and [DateTime]::UtcNow -lt $deadline)
        }

        if ($null -eq $process) {
          Write-Json $context 409 @{ ok = $false; error = 'window_not_found'; target = $targetId; started = $started } $origin
          continue
        }

        if (-not (Focus-TargetProcess $process)) {
          Write-Json $context 409 @{ ok = $false; error = 'foreground_switch_blocked'; target = $targetId; started = $started } $origin
          continue
        }

        Write-Json $context 200 @{
          ok = $true
          target = $targetId
          started = $started
          running = $true
          windowTitle = [string]$process.MainWindowTitle
          focusMode = 'explicit_user_action_only'
        } $origin
        continue
      }

      Write-Json $context 404 @{ ok = $false; error = 'not_found' } $origin
    } catch {
      try { Write-Json $context 500 @{ ok = $false; error = 'agent_error'; message = $_.Exception.Message } $origin } catch {}
    }
  }
} finally {
  if ($listener.IsListening) { $listener.Stop() }
  $listener.Close()
}
