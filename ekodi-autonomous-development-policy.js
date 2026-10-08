// Pure planning policy for EKODI development tasks. No production side effects.
const STATES = Object.freeze(['queued','leased','implementing','validating','pull_request','staging','production_verification','complete','retry_wait','blocked']);
const NEXT = Object.freeze({
 queued:['leased','blocked'], leased:['implementing','retry_wait','blocked'],
 implementing:['validating','retry_wait','blocked'], validating:['pull_request','retry_wait','blocked'],
 pull_request:['staging','retry_wait','blocked'], staging:['production_verification','retry_wait','blocked'],
 production_verification:['complete','retry_wait','blocked'], retry_wait:['leased','blocked'],
 blocked:[], complete:[]
});
const HIGH_RISK = new Set(['destructive_data','secrets','permission_expansion','authentication','billing','security_policy']);
export function planDevelopmentTask(input = {}) {
 const id = String(input.id || '').trim();
 const key = String(input.idempotencyKey || '').trim();
 if (!/^[a-zA-Z0-9._:-]{1,110}$/.test(id) || !/^[a-zA-Z0-9._:-]{1,160}$/.test(key)) throw new Error('invalid_task_identity');
 const risk = String(input.changeClass || 'normal');
 const maxAttempts = Math.max(1,Math.min(5,Math.trunc(Number(input.maxAttempts)||2)));
 return Object.freeze({id,idempotencyKey:key,state:'queued',changeClass:risk,
  approvalRequired:HIGH_RISK.has(risk),maxAttempts,attempts:0,
  budgetCalls:Math.max(0,Math.min(1000,Math.trunc(Number(input.budgetCalls)||20)))});
}
export function transitionDevelopmentTask(task, next, evidence = {}) {
 if (!STATES.includes(task?.state) || !NEXT[task.state].includes(next)) throw new Error('invalid_task_transition');
 if (next === 'complete' && !(evidence.productionVerified === true && evidence.releaseSha && evidence.functionalCheckPassed === true)) throw new Error('production_evidence_required');
 if (next === 'staging' && task.approvalRequired && evidence.approved !== true) throw new Error('approval_required');
 return Object.freeze({...task,state:next});
}
export function retryDecision(task, error, now = Date.now()) {
 const attempts = (Number(task.attempts)||0)+1;
 if (attempts >= task.maxAttempts || error?.permanent === true) return Object.freeze({...task,attempts,state:'blocked'});
 const retryAfterMs = Math.max(0,Math.min(86400000,Number(error?.retryAfterMs)||1000*Math.pow(2,attempts)));
 return Object.freeze({...task,attempts,state:'retry_wait',nextAttemptAt:new Date(now+retryAfterMs).toISOString()});
}
