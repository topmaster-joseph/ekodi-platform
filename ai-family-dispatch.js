import { inferTaskTraits, recommendModelFamily } from './ai-router-score.js';

export const AI_FAMILY_AUTO_DISPATCH_POLICY=Object.freeze({
  flag:'AI_ROUTE_FAMILY_AUTO_DISPATCH',
  defaultEnabled:false,
  globalMaxJobs:10,
  perDeviceModelMax:2,
  processingNoteAfterMs:60_000,
  generalTimeoutMs:180_000,
  codeTimeoutMs:600_000,
  leaseMs:300_000,
  costKrw:0,
});

const LANE=Object.freeze({chatgpt:'node:codex',claude:'node:claude-code'});
const CAPABILITY=Object.freeze({'node:codex':'aiFamilyCodex','node:claude-code':'aiFamilyClaudeCode'});
const TASK_TYPE=Object.freeze({'node:codex':'ai.family.codex','node:claude-code':'ai.family.claude-code'});

export function familyAutoDispatchEnabled(env={}){
  return String(env[AI_FAMILY_AUTO_DISPATCH_POLICY.flag]??'false').trim().toLowerCase()==='true';
}

export function planFamilyDispatch(message){
  const prompt=String(message||'').trim();
  const traits=inferTaskTraits({prompt});
  const recommendation=recommendModelFamily({prompt});
  const lane=LANE[recommendation.family];
  if(!prompt)return Object.freeze({ok:false,code:'ASSIST_MESSAGE_REQUIRED'});
  // The text-only native Codex CLI contract is NOT evidence of image output.
  // Never enqueue an image request until an independent image runner is proven.
  if(lane==='node:codex'&&traits.image){
    return Object.freeze({ok:false,code:'CODEX_IMAGE_RUNTIME_UNVERIFIED',reason:'Automatic Codex image generation has not passed capability verification.'});
  }
  if(lane==='node:codex'&&!traits.brainstorm){
    return Object.freeze({ok:false,code:'CODEX_TASK_UNSUPPORTED',reason:'Codex lane is limited to proven image or brainstorming capabilities.'});
  }
  return Object.freeze({
    ok:true,lane,taskType:TASK_TYPE[lane],capability:CAPABILITY[lane],
    family:recommendation.family,category:traits.category,
    timeoutMs:traits.code?AI_FAMILY_AUTO_DISPATCH_POLICY.codeTimeoutMs:AI_FAMILY_AUTO_DISPATCH_POLICY.generalTimeoutMs,
    costKrw:0,prompt,
  });
}


/**
 * True only when the authenticated device still holds a non-expired lease.
 * A self-reported completion cannot resurrect a job whose lease has lapsed.
 */
export function familyLeaseReceiptAllowed(expiresAt, nowMs=Date.now()){
  if(typeof expiresAt!=='string'||!expiresAt.trim())return false;
  const expiry=Date.parse(expiresAt);
  return Number.isFinite(expiry)&&Number.isFinite(nowMs)&&expiry>nowMs;
}

export function validateFamilyRunnerReceipt(receipt,{jobId,lane,deviceId}={}){
  if(!receipt||typeof receipt!=='object'||Array.isArray(receipt))return Object.freeze({ok:false,code:'RUNNER_RECEIPT_REQUIRED'});
  const output=String(receipt.output||'').trim();
  const completedAt=String(receipt.completedAt||'').trim();
  const validTime=Number.isFinite(Date.parse(completedAt));
  if(receipt.verified!==true||receipt.jobId!==jobId||receipt.lane!==lane||receipt.deviceId!==deviceId||!validTime||!output){
    return Object.freeze({ok:false,code:'RUNNER_RECEIPT_INVALID'});
  }
  return Object.freeze({ok:true,receipt:Object.freeze({
    jobId,lane,deviceId,verified:true,completedAt:new Date(completedAt).toISOString(),
    output:output.slice(0,12_000),fallbackFrom:String(receipt.fallbackFrom||'').slice(0,80)||null,
  })});
}
