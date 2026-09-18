$ErrorActionPreference = 'Stop'

$agentSource = Join-Path $PSScriptRoot 'ekodi-device-agent.ps1'
. $agentSource

$testRoot = Join-Path $env:RUNNER_TEMP ('ekodi-agent-transaction-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testRoot -Force | Out-Null
try {
  $script:Root = $testRoot
  $script:AgentPath = Join-Path $testRoot 'ekodi-device-agent.ps1'
  $script:ConfigPath = Join-Path $testRoot 'config.json'
  $script:UpgradeRoot = Join-Path $testRoot 'transactions'
  $script:TaskName = 'EKODI Device Agent Transaction Test'
  $script:ProtocolKey = 'Registry::HKEY_CURRENT_USER\Software\EKODI\TransactionTestProtocol'

  Set-Content -Path $script:AgentPath -Value '# previous stable agent' -Encoding UTF8
  @{ deviceId = 'test'; apiBase = $AllowedApiBase; protectedToken = 'test' } | ConvertTo-Json | Set-Content -Path $script:ConfigPath -Encoding UTF8

  $script:stopCalls = 0
  $script:protocolCalls = 0
  $script:taskCalls = 0
  $script:startCalls = 0
  $script:heartbeatCalls = 0
  $script:restoreTaskCalls = 0
  $script:restoreProtocolCalls = 0

  function Stop-ExistingAgentProcesses { $script:stopCalls++ }
  function Get-AgentTaskSnapshot { return @{ exists = $true; xml = '<Task />'; state = 'Ready' } }
  function Get-ProtocolSnapshot { return @{ exists = $true; rootValue = 'old'; urlProtocol = ''; command = 'old-command' } }
  function Restore-AgentTaskSnapshot($Snapshot) { $script:restoreTaskCalls++ }
  function Restore-ProtocolSnapshot($Snapshot) { $script:restoreProtocolCalls++ }
  function Register-EkodiProtocol { $script:protocolCalls++ }
  function Ensure-AgentTask { $script:taskCalls++ }
  function Start-AgentProcess { $script:startCalls++ }
  function Test-AgentRunProcess { return $true }
  function Test-AgentHeartbeatResume { $script:heartbeatCalls++; return $true }

  $badCandidate = Join-Path $testRoot 'bad-agent.ps1'
  Set-Content -Path $badCandidate -Value 'Write-Host bad' -Encoding UTF8
  $beforeValidationStopCalls = $script:stopCalls
  $validationFailed = $false
  try { [void](Invoke-AgentUpgradeTransaction -CandidatePath $badCandidate) } catch {
    $validationFailed = $_.Exception.Message -match 'EKA-10[123].*candidate_validation'
  }
  if (-not $validationFailed) { throw 'Malformed candidate did not fail candidate validation.' }
  if ($script:stopCalls -ne $beforeValidationStopCalls) { throw 'Existing Agent was stopped before candidate validation completed.' }

  $first = Invoke-AgentUpgradeTransaction -CandidatePath $agentSource
  if (-not $first.upgraded -or -not $first.heartbeatVerified) { throw 'Existing installation upgrade did not complete heartbeat verification.' }
  $candidateText = Get-Content $agentSource -Raw -Encoding UTF8
  if ((Get-Content $script:AgentPath -Raw -Encoding UTF8) -ne $candidateText) { throw 'Validated candidate was not promoted to AgentPath.' }

  $previousStable = '# stable-before-failure-injection'
  Set-Content -Path $script:AgentPath -Value $previousStable -Encoding UTF8
  $env:EKODI_AGENT_TEST_FAIL_STAGE = 'protocol_registered'
  $rollbackFailed = $false
  try { [void](Invoke-AgentUpgradeTransaction -CandidatePath $agentSource) } catch {
    $rollbackFailed = $_.Exception.Message -match 'EKA-140.*register_protocol.*롤백'
  } finally {
    Remove-Item Env:EKODI_AGENT_TEST_FAIL_STAGE -ErrorAction SilentlyContinue
  }
  if (-not $rollbackFailed) { throw 'Injected upgrade failure did not surface the register_protocol stage/code.' }
  if ((Get-Content $script:AgentPath -Raw -Encoding UTF8).Trim() -ne $previousStable) { throw 'Rollback did not restore the previous Agent file.' }
  if ($script:restoreTaskCalls -lt 1 -or $script:restoreProtocolCalls -lt 1) { throw 'Rollback did not restore Scheduled Task and protocol snapshots.' }

  $retry = Invoke-AgentUpgradeTransaction -CandidatePath $agentSource
  if (-not $retry.upgraded -or -not $retry.heartbeatVerified) { throw 'Re-upgrade after rollback did not succeed.' }
  if ((Get-Content $script:AgentPath -Raw -Encoding UTF8) -ne $candidateText) { throw 'Re-upgrade did not promote the candidate.' }
  if ($script:heartbeatCalls -lt 3) { throw 'Upgrade/rollback/re-upgrade did not exercise heartbeat verification and recovery.' }

  $script:elevationMockMode = 'admin'
  $script:elevationStartCalls = 0
  function Test-IsAdministrator { return $script:elevationMockMode -eq 'admin' }
  function Start-Process {
    param(
      [Parameter(Position=0)][string]$FilePath,
      [string]$Verb,
      [switch]$Wait,
      [switch]$PassThru,
      [object[]]$ArgumentList
    )
    $script:elevationStartCalls++
    if ($script:elevationMockMode -eq 'cancel') {
      throw [ComponentModel.Win32Exception]::new(1223)
    }
    $index = [Array]::IndexOf($ArgumentList, '-ElevationResultPath')
    if ($index -lt 0 -or $index + 1 -ge $ArgumentList.Count) { throw 'Elevation result path argument missing.' }
    $recordPath = ([string]$ArgumentList[$index + 1]).Trim('"')
    if ($script:elevationMockMode -eq 'structured-failure') {
      Write-ElevationFailureRecord $recordPath '[EKODI:EKA-299][enrollment] simulated-child-failure'
      return [pscustomobject]@{ ExitCode = 1 }
    }
    if ($script:elevationMockMode -eq 'plain-failure') {
      Write-ElevationFailureRecord $recordPath 'simulated plain child failure'
      return [pscustomobject]@{ ExitCode = 1 }
    }
    return [pscustomobject]@{ ExitCode = 0 }
  }

  [void](Invoke-ElevatedSelf @('-RegisterProtocol'))
  if ($script:elevationStartCalls -ne 0) { throw 'Already elevated execution unexpectedly invoked RunAs.' }

  $script:elevationMockMode = 'structured-failure'
  $preservedStructuredFailure = $false
  try { [void](Invoke-ElevatedSelf @('-RegisterProtocol')) } catch {
    $preservedStructuredFailure = $_.Exception.Message -eq '[EKODI:EKA-299][enrollment] simulated-child-failure'
  }
  if (-not $preservedStructuredFailure) { throw 'Elevated child EKODI stage error was not preserved.' }

  $script:elevationMockMode = 'plain-failure'
  $plainFailureMapped = $false
  try { [void](Invoke-ElevatedSelf @('-RegisterProtocol')) } catch {
    $plainFailureMapped = $_.Exception.Message -match '^\[EKODI:EKA-091\]\[elevation_child\].*simulated plain child failure'
  }
  if (-not $plainFailureMapped) { throw 'Unstructured elevated child failure was not mapped to EKA-091.' }

  $script:elevationMockMode = 'cancel'
  $cancelMapped = $false
  try { [void](Invoke-ElevatedSelf @('-RegisterProtocol')) } catch {
    $cancelMapped = $_.Exception.Message -match '^\[EKODI:EKA-092\]\[elevation\]'
  }
  if (-not $cancelMapped) { throw 'UAC cancellation was not mapped to EKA-092.' }

  Write-Host 'Elevation regression PASS: admin bypass -> child detail propagation -> plain failure mapping -> UAC cancellation.'
  Write-Host 'Transactional upgrade regression PASS: validate -> upgrade -> injected failure -> rollback -> re-upgrade.'
} finally {
  Remove-Item Env:EKODI_AGENT_TEST_FAIL_STAGE -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $testRoot -Recurse -Force -ErrorAction SilentlyContinue
}
