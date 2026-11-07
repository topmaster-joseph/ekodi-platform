import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = file => readFileSync(new URL('../'+file,import.meta.url),'utf8');
const policy=JSON.parse(read('config/ekodi-native-browser-update-policy.json'));
const agent=read('tools/ekodi-device-agent/windows/ekodi-device-agent.ps1');
const worker=read('scripts/ekodi-background-browser-worker.mjs');

test('automatic native browser updates are EKODI-owned, pinned, bounded and auditable',()=>{
  assert.equal(policy.policyId,'EKODI-AGENT-AUTOUPDATE-001');
  assert.equal(policy.owner,'ekodi-orchestrator');
  assert.equal(policy.pinning.immutableCommitRequired,true);
  assert.equal(policy.pinning.sha256Required,true);
  assert.equal(policy.pinning.arbitraryManifestUrlForbidden,true);
  assert.equal(policy.rollout.initialPercent,25);
  assert.equal(policy.rollout.checkIntervalHours,24);
  assert.equal(policy.rollout.broadRolloutRequiresNewProtectedReview,true);
  assert.equal(policy.safety.existingTransactionRollbackRequired,true);
  assert.equal(policy.safety.interactiveAuthSessionBlocksUpdate,true);
  assert.equal(policy.safety.silentHostPrivilegeEscalationForbidden,true);
  assert.equal(policy.safety.extraCostForbidden,true);
  assert.equal(policy.releaseState,'pending-orchestrator-merge-and-immutable-manifest');
});

test('installed Agent uses fixed host, immutable commit, cryptographic hash, rollback and 25% canary',()=>{
  assert.match(agent,/\$AgentAutoUpdateManifestUrl = 'https:\/\/raw\.githubusercontent\.com\/topmaster-joseph\/ekodi-platform\/main\/config\/ekodi-device-agent-release\.json'/);
  assert.match(agent,/Test-EkodiApprovedAgentManifest/);
  assert.match(agent,/\$m\.sourceCommit -cnotmatch '\^\[a-f0-9\]\{40\}\$'/);
  assert.match(agent,/\$m\.sha256 -cnotmatch '\^\[a-f0-9\]\{64\}\$'/);
  assert.match(agent,/\[int\]\$m\.rolloutPercent -ne 25/);
  assert.match(agent,/Test-EkodiAgentCanaryMembership/);
  assert.match(agent,/Get-FileHash -LiteralPath \$candidate -Algorithm SHA256/);
  assert.match(agent,/Invoke-AgentUpgradeTransaction -CandidatePath \$candidate -DeferRestart/);
  assert.match(agent,/Test-Path -LiteralPath \$InteractiveAuthStatePath/);
  assert.match(agent,/Invoke-EkodiAgentAutoUpdateIfApproved \$config/);
  assert.match(agent,/browserAutoUpdateDisabled/);
  assert.match(agent,/installed-pending-restart/);
  assert.match(agent,/24\) \{ return \}/);
  assert.doesNotMatch(agent,/tinyfish\.ai|agent\.tinyfish\.ai/i);
});
test('native browser workers remain private, headless, canonical and cost independent',()=>{
  assert.match(worker,/await import\('playwright'\)/);
  assert.match(worker,/ephemeralContext:true/);
  assert.match(worker,/CF_QUOTA_CIRCUIT_OPEN/);
  assert.match(worker,/performance:summarizeNativeNavigationPerformance\(navigationTimings\)/);
  assert.doesNotMatch(worker,/tinyfish|screenshotToRemoteSession|userBrowserCookie/i);
});

test('native Agent must not claim an update is verified until new-version heartbeat succeeds',()=>{
  assert.match(agent, /\$AgentVersion = '2\.6\.4'/);
  assert.match(agent,/function Confirm-EkodiAgentAutoUpdateAfterRestart/);
  assert.match(agent,/outcome -cne 'installed-pending-restart'/);
  assert.match(agent,/targetVersion -cne \$AgentVersion/);
  assert.match(agent,/verified-after-restart/);
  assert.match(agent,/Send-Heartbeat \$config; Confirm-EkodiAgentAutoUpdateAfterRestart/);
  assert.match(agent,/nativeBrowserUpdateState = Get-EkodiAgentAutoUpdateProjection/);
  const projection=agent.slice(agent.indexOf('function Get-EkodiAgentAutoUpdateProjection'),agent.indexOf('function Get-AgentSettings'));
  assert.doesNotMatch(projection,/Get-AgentHeaders|Unprotect-LocalSecret|email|password/i);
});


test('official self-update uses unique candidate, bounded network and existing rollback',()=>{
  const begin=agent.indexOf('function Update-AgentFromOfficialSource {');
  const end=agent.indexOf('# EKODI-AGENT-AUTOUPDATE-001:',begin);
  assert.ok(begin>=0&&end>begin);
  const update=agent.slice(begin,end);
  assert.match(update,/NewGuid\(\)\.ToString\('N'\)/);
  assert.match(update,/Invoke-WebRequest -UseBasicParsing -Uri \$AgentSourceUrl -OutFile \$temp -TimeoutSec 25 -ErrorAction Stop/);
  assert.match(update,/Assert-AgentCandidate \$temp/);
  assert.match(update,/Invoke-AgentUpgradeTransaction -CandidatePath \$temp -DeferRestart/);
  assert.match(update,/finally \{/);
  assert.match(update,/Remove-Item -LiteralPath \$temp -Force -ErrorAction SilentlyContinue/);
  assert.doesNotMatch(update,/'ekodi-device-agent-update\.ps1'/);
  // Comments are excluded, not included, from executable privilege checks.
  const executable=update.split('\n').filter(line=>!/^\s*#/.test(line)).join('\n');
  const forbidden=/Set-ExecutionPolicy|(?:^|\s)-Verb\s+RunAs\b|(?:^|\s)-ExecutionPolicy\s+Bypass\b|CF_ACCESS_CLIENT_SECRET|chrome\.exe/i;
  assert.doesNotMatch(executable,forbidden);
  assert.match('Start-Process pwsh -Verb RunAs',forbidden);
  assert.match('pwsh -ExecutionPolicy Bypass',forbidden);
  assert.doesNotMatch('# Start-Process pwsh -Verb RunAs'.split('\n').filter(line=>!/^\s*#/.test(line)).join('\n'),forbidden);
});
