$ErrorActionPreference = 'Stop'
$agent = Join-Path $PSScriptRoot 'ekodi-device-agent.ps1'
$oldProgramData = [Environment]::GetEnvironmentVariable('ProgramData','Process')
$SandboxRoot = Join-Path ([IO.Path]::GetTempPath()) ('ekodi-native-agent-smoke-' + [guid]::NewGuid().ToString('N'))
try {
  Remove-Item Env:\ProgramData -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force -Path $SandboxRoot | Out-Null
  # Import definitions only: do not invoke install/run/protocol dispatch in a CI smoke test.
  $source = [IO.File]::ReadAllText($agent).Replace(([string][char]13+[char]10),[string][char]10)
  $match = [regex]::Match($source, '\ntry \{\n  if \(\$ProtocolUrl\)')
  if (-not $match.Success) { throw 'agent_entrypoint_marker_missing' }
  $definitions = Join-Path $SandboxRoot 'agent-definitions.ps1'
  [IO.File]::WriteAllText($definitions,$source.Substring(0,$match.Index),[Text.UTF8Encoding]::new($true))
  . $definitions
  if (-not (Test-Path -LiteralPath $CommonDataRoot)) { throw 'common_appdata_fallback_failed' }
  $httpHandler = [Net.Http.HttpClientHandler]::new()
  $httpHandler.Dispose()
  $Root = $SandboxRoot
  Write-AgentRuntimeStatus 'retrying' 'RATE_LIMITED' 3 60
  $health = Get-Content (Join-Path $SandboxRoot 'runtime-status.json') -Raw | ConvertFrom-Json
  if ($health.reason -ne 'RATE_LIMITED' -or $health.consecutiveFailures -ne 3 -or $health.retrySeconds -ne 60) { throw 'health_report_invalid' }
  if ($health.PSObject.Properties.Name -contains 'token') { throw 'secret_in_health_report' }
  $fake = [pscustomobject]@{Exception=[pscustomobject]@{Response=[pscustomobject]@{StatusCode=401}}}
  if ((Get-AgentRetryCode $fake) -ne 'AUTH_REQUIRED') { throw 'auth_retry_not_classified' }
  $fake.Exception.Response.StatusCode = 429
  if ((Get-AgentRetryCode $fake) -ne 'RATE_LIMITED') { throw 'rate_limit_not_classified' }
  function Get-AgentHeaders { param($Config) return @{} }
  function Invoke-RestMethod { param($Method,$Uri,$Headers) return @{command=$null} }
  if (Poll-Command ([pscustomobject]@{apiBase='https://ekodi.kr'})) { throw 'idle_poll_must_report_no_work' }
  Write-Output 'PASS: native_windows_powershell_runtime'
} finally {
  [Environment]::SetEnvironmentVariable('ProgramData',$oldProgramData,'Process')
  Remove-Item -LiteralPath $SandboxRoot -Force -Recurse -ErrorAction SilentlyContinue
}
