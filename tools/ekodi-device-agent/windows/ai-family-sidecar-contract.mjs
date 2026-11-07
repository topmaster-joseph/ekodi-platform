// EKODI family CLI sidecar contract. No network, no credentials and no process execution.
// The elevated Windows Device Agent MUST NOT run subscription CLIs directly.
import { win32 } from 'node:path';

export const AI_FAMILY_SIDECAR_POLICY=Object.freeze({
  autoEnabled:false,
  maxPromptChars:4000,
  maximumOutputChars:12000,
  generalTimeoutMs:180000,
  codeTimeoutMs:600000,
  consentFreshnessMs:24*60*60*1000,
  paidApiBudgetKrw:0,
});
const JOB_TYPES=Object.freeze({
  'ai.family.codex':{lane:'node:codex',provider:'codex-cli'},
  'ai.family.claude-code':{lane:'node:claude-code',provider:'claude-code-cli'},
});
const KEY_RE=/^[a-f0-9]{64}$/;
const ID_RE=/^hyb_[a-f0-9-]{36}$/i;
const DATE_FIELDS=['issuedAt','claimedAt','leaseExpiresAt'];

function reject(code){return Object.freeze({ok:false,code});}

export function inspectLocalFamilyClaim(command,nowMs=Date.now()){
  if(!command||typeof command!=='object'||Array.isArray(command))return reject('CLAIM_REQUIRED');
  const profile=JOB_TYPES[command.type];
  if(!profile)return reject('TASK_NOT_ALLOWLISTED');
  if(!ID_RE.test(String(command.id||'')))return reject('INVALID_JOB_ID');
  const payload=command.payload;
  if(!payload||typeof payload!=='object'||Array.isArray(payload))return reject('PAYLOAD_REQUIRED');
  const prompt=typeof payload.prompt==='string'?payload.prompt.trim():'';
  if(!prompt||prompt.length>AI_FAMILY_SIDECAR_POLICY.maxPromptChars)return reject('INVALID_PROMPT_LENGTH');
  if(payload.lane!==profile.lane)return reject('LANE_MISMATCH');
  if(!KEY_RE.test(String(payload.requestKey||'')))return reject('INVALID_REQUEST_KEY');
  if(payload.costKrw!==0)return reject('METERED_PROVIDER_FORBIDDEN');
  const timeout=Number(payload.timeoutMs);
  if(![AI_FAMILY_SIDECAR_POLICY.generalTimeoutMs,AI_FAMILY_SIDECAR_POLICY.codeTimeoutMs].includes(timeout))return reject('TIMEOUT_POLICY_VIOLATION');
  if(!Number.isFinite(nowMs))return reject('INVALID_CURRENT_TIME');
  const times={};
  for(const key of DATE_FIELDS){
    times[key]=Date.parse(String(command[key]||''));
    if(!Number.isFinite(times[key]))return reject('LEASE_EVIDENCE_REQUIRED');
  }
  if(times.claimedAt<times.issuedAt||times.claimedAt>nowMs+30000)return reject('CLAIM_TIME_INVALID');
  const deadline=Math.min(times.issuedAt+timeout,times.leaseExpiresAt);
  if(deadline<=nowMs)return reject('LEASE_OR_JOB_EXPIRED');
  const attempt=Number(command.attempt);
  if(!Number.isSafeInteger(attempt)||attempt!==1)return reject('REPLAY_OR_RETRY_FORBIDDEN');
  return Object.freeze({ok:true,jobId:command.id,taskType:command.type,
    lane:profile.lane,provider:profile.provider,prompt,requestKey:payload.requestKey,
    deadlineMs:deadline,timeoutMs:timeout,attempt});
}

// "approval" is an input from an independently verified OS-level, non-elevated
// consent broker. This function DOES NOT establish identity or privilege itself.
export function planReadOnlyFamilyInvocation(claim,approval,nowMs=Date.now()){
  if(!claim?.ok)return reject('CLAIM_UNVERIFIED');
  if(!approval||approval.enabled!==true||approval.nonElevatedVerified!==true||
     approval.authMethod!=='oauth_token'||approval.deviceIdVerified!==true)
    return reject('LOCAL_USER_CONSENT_REQUIRED');
  if(approval.provider!==claim.provider||approval.readOnly!==true)return reject('PROVIDER_NOT_AUTHORIZED');
  const verifiedAt=Date.parse(String(approval.verifiedAt||''));
  if(!Number.isFinite(verifiedAt)||verifiedAt>nowMs||
     verifiedAt<nowMs-AI_FAMILY_SIDECAR_POLICY.consentFreshnessMs)
    return reject('CANARY_EXPIRED');
  const scriptPath=String(approval.cliScriptPath||'');
  const nodePath=String(approval.nodeExecutable||'');
  const workspace=String(approval.readOnlyWorkspace||'');
  if(![scriptPath,nodePath,workspace].every(x=>x&&!x.includes('"')&&
     !x.includes('\n')&&!x.includes('\r')&&win32.isAbsolute(x)))
    return reject('EXECUTION_PATH_UNTRUSTED');
  const expected=claim.provider==='codex-cli'?'\\@openai\\codex\\bin\\codex.js':'\\@anthropic-ai\\claude-code\\cli.js';
  if(!scriptPath.toLowerCase().replaceAll('/','\\').endsWith(expected))
    return reject('CLI_SCRIPT_NOT_ALLOWLISTED');
  if(!nodePath.toLowerCase().endsWith('\\node.exe'))return reject('NODE_BINARY_NOT_ALLOWLISTED');
  if(!KEY_RE.test(String(approval.cliScriptSha256||''))||approval.binaryHashVerified!==true)
    return reject('BINARY_PROOF_REQUIRED');
  // The provider is deliberately read-only: no shell, no workspace mutation,
  // no API key arguments and no consumer-browser session automation.
  const args=claim.provider==='codex-cli'
    ? [scriptPath,'exec','--ignore-user-config','-s','read-only','-C',workspace,'-']
    : [scriptPath,'-p','--permission-mode','plan','--allowedTools','Read,Grep,Glob',
       '--max-turns','4','--output-format','text'];
  return Object.freeze({ok:true,executable:nodePath,args:Object.freeze(args),cwd:workspace,
    provider:claim.provider,jobId:claim.jobId,deadlineMs:claim.deadlineMs});
}

export function meteredApiFreeEnvironment(source={}){
  const allowed=['SYSTEMROOT','SystemRoot','WINDIR','PATH','Path','PATHEXT','APPDATA','LOCALAPPDATA',
    'USERPROFILE','HOME','HOMEDRIVE','HOMEPATH','TEMP','TMP','COMSPEC'];
  const clean={};
  for(const key of allowed){
    if(typeof source[key]==='string'&&source[key])clean[key]=source[key];
  }
  return Object.freeze(clean);
}

export function buildVerifiedFamilyReceipt(claim,run,deviceId,clock=Date.now()){
  if(!claim?.ok||!run||run.exitCode!==0||run.fenced!==true||
     run.authenticatedCli!==true||!String(deviceId||'').trim())
    return reject('RUNNER_NOT_VERIFIED');
  const completedAt=Number.isFinite(clock)?clock:Date.now();
  if(completedAt>claim.deadlineMs)return reject('LEASE_OR_JOB_EXPIRED');
  const output=typeof run.output==='string'?run.output.trim():'';
  if(!output)return reject('EMPTY_RUNNER_RESULT');
  return Object.freeze({ok:true,receipt:Object.freeze({
    jobId:claim.jobId,lane:claim.lane,deviceId,verified:true,
    completedAt:new Date(completedAt).toISOString(),
    output:output.slice(0,AI_FAMILY_SIDECAR_POLICY.maximumOutputChars),
    executor:claim.provider,mode:'read-only',costKrw:0,
  })});
}
