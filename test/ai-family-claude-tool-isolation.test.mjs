import test from 'node:test';
import assert from 'node:assert/strict';
import {
  inspectLocalFamilyClaim,
  planReadOnlyFamilyInvocation,
} from '../tools/ekodi-device-agent/windows/ai-family-sidecar-contract.mjs';

const NOW=Date.parse('2026-11-07T15:00:00Z');
const SHA='a'.repeat(64);
const task=(type)=>({
  id:'hyb_12345678-1234-4234-8234-123456789abc',
  type,issuedAt:new Date(NOW-60000).toISOString(),
  claimedAt:new Date(NOW-5000).toISOString(),
  leaseExpiresAt:new Date(NOW+240000).toISOString(),attempt:1,
  payload:{
    lane:type==='ai.family.claude-code'?'node:claude-code':'node:codex',
    prompt:'Summarize visible code without editing or network calls.',
    requestKey:SHA,costKrw:0,timeoutMs:600000,
  },
});
const approval=provider=>({
  enabled:true,nonElevatedVerified:true,deviceIdVerified:true,
  authMethod:'oauth_token',provider,readOnly:true,
  verifiedAt:new Date(NOW-1000).toISOString(),
  nodeExecutable:'C:\\Program Files\\nodejs\\node.exe',
  cliScriptPath:provider==='claude-code-cli'
    ? 'C:\\Users\\user\\AppData\\Roaming\\npm\\node_modules\\@anthropic-ai\\claude-code\\cli.js'
    : 'C:\\Users\\user\\AppData\\Roaming\\npm\\node_modules\\@openai\\codex\\bin\\codex.js',
  readOnlyWorkspace:'C:\\EKODI\\readonly',
  cliScriptSha256:SHA,nodeExecutableSha256:SHA,binaryHashVerified:true,
});

test('Claude actual built-in and MCP availability are locked to read-only tools',()=>{
  const claim=inspectLocalFamilyClaim(task('ai.family.claude-code'),NOW);
  assert.equal(claim.ok,true);
  const planned=planReadOnlyFamilyInvocation(claim,approval('claude-code-cli'),NOW);
  assert.equal(planned.ok,true,JSON.stringify(planned));
  const args=planned.args;
  const valueFor=flag=>args[args.indexOf(flag)+1];
  assert.equal(args.includes('--restricted'),true);
  assert.equal(valueFor('--permission-mode'),'plan');
  assert.equal(valueFor('--tools'),'Read,Grep,Glob');
  assert.equal(valueFor('--disallowedTools'),'mcp__*');
  assert.equal(valueFor('--max-turns'),'4');
  assert.equal(valueFor('--output-format'),'text');
  assert.equal(args.includes('-p'),true);
  assert.equal(args.includes('--allowedTools'),false,
    '--allowedTools only auto-approves; it does not remove other built-in tools');
  for(const forbidden of ['Bash','Edit','Write','NotebookEdit',
    '--dangerously-skip-permissions','--allow-dangerously-skip-permissions',
    '--chrome','--permission-mode=bypassPermissions','--bg','--cloud']){
    assert.equal(args.includes(forbidden),false,forbidden);
  }
  assert.equal(Object.isFrozen(args),true);
});

test('Native Claude execution never accepts a provider-mismatched or custom script path',()=>{
  const claim=inspectLocalFamilyClaim(task('ai.family.claude-code'),NOW);
  const wrongProvider=planReadOnlyFamilyInvocation(claim,approval('codex-cli'),NOW);
  assert.equal(wrongProvider.code,'PROVIDER_NOT_AUTHORIZED');
  const hijacked=approval('claude-code-cli');
  hijacked.cliScriptPath='C:\\Users\\user\\Downloads\\runner.js';
  assert.equal(planReadOnlyFamilyInvocation(claim,hijacked,NOW).code,
    'CLI_SCRIPT_NOT_ALLOWLISTED');
});

test('Codex read-only defaults are not accidentally relaxed by Claude tool hardening',()=>{
  const claim=inspectLocalFamilyClaim(task('ai.family.codex'),NOW);
  const plan=planReadOnlyFamilyInvocation(claim,approval('codex-cli'),NOW);
  assert.equal(plan.ok,true);
  assert.equal(plan.args.includes('read-only'),true);
  assert.equal(plan.args.includes('--ignore-user-config'),true);
  assert.equal(plan.args.includes('danger-full-access'),false);
  assert.equal(plan.args.includes('--dangerously-bypass-approvals-and-sandbox'),false);
});
