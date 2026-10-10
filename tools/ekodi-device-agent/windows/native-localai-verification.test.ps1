# EKODI native LocalAI Device Agent test, runs on Windows PowerShell 5.1.
# All loopback calls are mocked. This is NOT a live USER2 inference receipt.
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'ekodi-device-agent.ps1')

$script:TestScenario = 'success'
$script:TestRequests = @()
function Assert-Equals([string]$Case, [object]$Actual, [object]$Expected) {
  if ([string]$Actual -cne [string]$Expected) {
    throw ('FAIL ' + $Case + ': expected=' + [string]$Expected + ' actual=' + [string]$Actual)
  }
  Write-Output ('PASS ' + $Case)
}
function Invoke-RestMethod {
  [CmdletBinding()]
  param(
    [string]$Method = 'Get',
    [string]$Uri,
    [object]$Body,
    [string]$ContentType,
    [int]$TimeoutSec = 30
  )
  $script:TestRequests += $Uri
  switch -Regex ($Uri) {
    '/api/version$' {
      if ($script:TestScenario -eq 'down') { throw 'synthetic network timeout' }
      return [pscustomobject]@{ version = '0.mock.test' }
    }
    '/api/tags$' {
      if ($script:TestScenario -eq 'missing_model') {
        return [pscustomobject]@{ models = @([pscustomobject]@{ name = 'unapproved:model' }) }
      }
      return [pscustomobject]@{ models = @([pscustomobject]@{ name = 'qwen2.5-coder:1.5b' }) }
    }
    '/api/generate$' {
      if ($script:TestScenario -eq 'generate_error') { throw 'synthetic inference timeout' }
      if ($Method -ne 'Post' -or $TimeoutSec -gt 45) { throw 'unexpected method or unbounded timeout' }
      $request = $Body | ConvertFrom-Json
      if ($request.model -ne 'qwen2.5-coder:1.5b' -or $request.stream -ne $false) {
        throw 'unexpected model or streaming'
      }
      if ($request.options.num_predict -gt 8 -or $request.options.num_ctx -gt 512) {
        throw 'unbounded local inference'
      }
      if ($script:TestScenario -eq 'wrong_reply') {
        return [pscustomobject]@{ response = 'not the expected answer' }
      }
      return [pscustomobject]@{ response = 'OK' }
    }
    default { throw 'unexpected endpoint' }
  }
}

$script:TestScenario = 'success'
$script:TestRequests = @()
$pass = Get-EkodiLocalAiVerification
Assert-Equals 'success API' $pass.localAiProof.ollamaApi 'ready'
Assert-Equals 'success model' $pass.localAiProof.selectedModel 'qwen2.5-coder:1.5b'
Assert-Equals 'success inference' $pass.localAiProof.inference 'passed'
Assert-Equals 'success request count' $script:TestRequests.Count 3
Assert-Equals 'secret-free result' $pass.localAiProof.credentialCollection $false
Assert-Equals 'Claude auth not inferred' $pass.localAiProof.claudeAuth 'requires_interactive_user_verification'
Assert-Equals 'execution fixed to loopback' $pass.localAiProof.executionMode 'fixed_loopback_api'

$script:TestScenario = 'missing_model'
$script:TestRequests = @()
$missing = Get-EkodiLocalAiVerification
Assert-Equals 'missing model' $missing.localAiProof.inference 'approved_model_missing'
Assert-Equals 'no generation without model' $script:TestRequests.Count 2

$script:TestScenario = 'down'
$script:TestRequests = @()
$down = Get-EkodiLocalAiVerification
Assert-Equals 'offline API' $down.localAiProof.ollamaApi 'unavailable'
Assert-Equals 'offline does not infer' $down.localAiProof.inference 'not_checked'
Assert-Equals 'offline short-circuit' $script:TestRequests.Count 1

$script:TestScenario = 'wrong_reply'
$script:TestRequests = @()
$wrong = Get-EkodiLocalAiVerification
Assert-Equals 'response mismatch is not success' $wrong.localAiProof.inference 'nonmatching_response'

$script:TestScenario = 'generate_error'
$script:TestRequests = @()
$errorResult = Get-EkodiLocalAiVerification
Assert-Equals 'inference API failure is not success' $errorResult.localAiProof.inference 'api_error_or_timeout'
Write-Output 'PASS EKODI native LocalAI PowerShell 5.1 simulated runtime cases'
