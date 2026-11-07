import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AI_FAMILY_SIDECAR_POLICY,
  inspectLocalFamilyClaim,
  planReadOnlyFamilyInvocation,
  meteredApiFreeEnvironment,
  buildVerifiedFamilyReceipt,
} from '../tools/ekodi-device-agent/windows/ai-family-sidecar-contract.mjs';

const NOW=Date.parse('2026-11-07T01:00:00.000Z');
const CLAIMED='2026-11-07T00:59:00.000Z';
const ISSUED='2026-11-07T00:58:00.000Z';
const LEASE='2026-11-07T01:04:00.000Z';
const ID='hyb_12345678-1234-4234-8234-123456789abc';
const SHA='a'.repeat(64);
const makeJob=(type='ai.family.claude-code')=>({
  id:ID,type,issuedAt:ISSUED,claimedAt:CLAIMED,leaseExpiresAt:LEASE,attempt:1,
  payload:{
    lane:type==='ai.family.claude-code'?'node:claude-code':'node:codex',
    prompt:'Review safe test code without making changes.',
    requestKey:SHA,costKrw:0,
    timeoutMs:type==='ai.family.claude-code'?600000:180000,
  },
});
const approval=(provider)=>({
  enabled:true,nonElevatedVerified:true,deviceIdVerified:true,
  authMethod:'oauth_token',provider,readOnly:true,
  verifiedAt:'2026-11-07T00:45:00.000Z',
  nodeExecutable:'C:\\Program Files\\nodejs\\node.exe',
  cliScriptPath:provider==='codex-cli'
    ? 'C:\\Users\\user\\AppData\\Roaming\\npm\\node_modules\\@openai\\codex\\bin\\codex.js'
    : 'C:\\Users\\user\\AppData\\Roaming\\npm\\node_modules\\@anthropic-ai\\claude-code\\cli.js',
  readOnlyWorkspace:'C:\\EKODI\\readonly',
  cliScriptSha256:SHA,binaryHashVerified:true,
});

test('native sidecar is inert by default with no paid API execution',()=>{
  assert.equal(AI_FAMILY_SIDECAR_POLICY.autoEnabled,false);
  assert.equal(AI_FAMILY_SIDECAR_POLICY.paidApiBudgetKrw,0);
});

test('accept only fresh, exact allowlisted family claim envelopes',()=>{
  const code=inspectLocalFamilyClaim(makeJob(),NOW);
  assert.equal(code.ok,true);
  assert.equal(code.provider,'claude-code-cli');
  const codex=inspectLocalFamilyClaim(makeJob('ai.family.codex'),NOW);
  assert.equal(codex.ok,true);
  assert.equal(codex.provider,'codex-cli');
  for(const [key,value] of [
    ['type','arbitrary.shell'],['id','unexpected'],['attempt',2],
    ['leaseExpiresAt','2026-11-07T00:59:00Z'],
  ]){
    const bad={...makeJob(),[key]:value};
    assert.equal(inspectLocalFamilyClaim(bad,NOW).ok,false,key);
  }
  const paid=makeJob();paid.payload.costKrw=1;
  assert.equal(inspectLocalFamilyClaim(paid,NOW).code,'METERED_PROVIDER_FORBIDDEN');
  const wrong=makeJob();wrong.payload.requestKey='not-a-hash';
  assert.equal(inspectLocalFamilyClaim(wrong,NOW).code,'INVALID_REQUEST_KEY');
  const different=makeJob();different.payload.lane='node:codex';
  assert.equal(inspectLocalFamilyClaim(different,NOW).code,'LANE_MISMATCH');
});

test('read-only CLI plans require external consent and OS-level proof',()=>{
  const job=inspectLocalFamilyClaim(makeJob(),NOW);
  const declined=planReadOnlyFamilyInvocation(job,{...approval('claude-code-cli'),enabled:false},NOW);
  assert.equal(declined.code,'LOCAL_USER_CONSENT_REQUIRED');
  const stale=planReadOnlyFamilyInvocation(job,{...approval('claude-code-cli'),verifiedAt:'2026-11-01T00:00:00Z'},NOW);
  assert.equal(stale.code,'CANARY_EXPIRED');
  const elevated=planReadOnlyFamilyInvocation(job,{...approval('claude-code-cli'),nonElevatedVerified:false},NOW);
  assert.equal(elevated.code,'LOCAL_USER_CONSENT_REQUIRED');
  const permitted=planReadOnlyFamilyInvocation(job,approval('claude-code-cli'),NOW);
  assert.equal(permitted.ok,true);
  assert.equal(permitted.args.includes('plan'),true);
  assert.equal(permitted.args.includes('Bash'),false);
  const codex=planReadOnlyFamilyInvocation(inspectLocalFamilyClaim(makeJob('ai.family.codex'),NOW),approval('codex-cli'),NOW);
  assert.equal(codex.ok,true);
  assert.equal(codex.args.includes('read-only'),true);
  assert.equal(codex.args.includes('--ignore-user-config'),true);
  assert.equal(codex.args.includes('danger-full-access'),false);
});

test('environment has no metered API keys or arbitrary user variables',()=>{
  const env=meteredApiFreeEnvironment({
    APPDATA:'C:\\Users\\user\\AppData\\Roaming',PATH:'C:\\Program Files\\nodejs',
    OPENAI_API_KEY:'secret',ANTHROPIC_API_KEY:'secret',EKODI_DEVICE_TOKEN:'secret',
    CUSTOM_SECRET:'secret',
  });
  assert.equal(env.APPDATA,'C:\\Users\\user\\AppData\\Roaming');
  for(const key of ['OPENAI_API_KEY','ANTHROPIC_API_KEY','EKODI_DEVICE_TOKEN','CUSTOM_SECRET']){
    assert.equal(key in env,false);
  }
});

test('receipt is issued only for a successful, authenticated, still-leased run',()=>{
  const claim=inspectLocalFamilyClaim(makeJob(),NOW);
  assert.equal(buildVerifiedFamilyReceipt(claim,{exitCode:1,fenced:true,authenticatedCli:true,output:'bad'},'device-1',NOW).ok,false);
  assert.equal(buildVerifiedFamilyReceipt(claim,{exitCode:0,fenced:false,authenticatedCli:true,output:'bad'},'device-1',NOW).ok,false);
  const success=buildVerifiedFamilyReceipt(claim,{exitCode:0,fenced:true,authenticatedCli:true,output:'safe response'},'device-1',NOW);
  assert.equal(success.ok,true);
  assert.equal(success.receipt.executor,'claude-code-cli');
  assert.equal(success.receipt.costKrw,0);
  assert.equal(success.receipt.output,'safe response');
  assert.equal(buildVerifiedFamilyReceipt(claim,{exitCode:0,fenced:true,authenticatedCli:true,output:'late'},'device-1',NOW+300000).ok,false);
});
