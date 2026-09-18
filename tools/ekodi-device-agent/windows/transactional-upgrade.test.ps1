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
  Set-Content -Path $script:ConfigPath -Value '{"deviceId":"test","apiBase":"https://api.ekodi.kr","protectedToken":"test"}' -Encoding UTF8

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

  Write-Host 'Transactional upgrade regression PASS: validate -> upgrade -> injected failure -> rollback -> re-upgrade.'
} finally {
  Remove-Item Env:EKODI_AGENT_TEST_FAIL_STAGE -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $testRoot -Recurse -Force -ErrorAction SilentlyContinue
}
