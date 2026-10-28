// EKODI Growth OS: purpose-first, evidence-gated readiness for any organization.
// Side-effect-free core: verified authorization and scoped source retrieval MUST be
// supplied by the caller. An assertion field is not an access-control grant.
import { GROWTH_DIMENSIONS, GROWTH_PROFILES } from './growth-intelligence-core.js';

export const GROWTH_ASSESSMENT_POLICY=Object.freeze({
  id:'EKODI-GROWTH-PURPOSE-EVIDENCE-001',
  kind:'readiness_not_performance_rating',
  allowedDefaultMaxAgeDays:90,
  autonomousAction:false,
  spending:false,
  externalPublishing:false,
  tenantDataJoin:false,
});
const VALID_STATES=new Set(['observed','issue','withheld','not_connected']);
const safeId=value=>typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value)?value:null;
function parsedTime(value){
  if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(value))return null;
  const ms=Date.parse(value);
  return Number.isFinite(ms)?ms:null;
}
function confirmedPurpose(value,workspaceId,profile,now){
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const when=parsedTime(value.confirmedAt);
  return value.confirmed===true &&
    value.workspaceId===workspaceId && value.profile===profile &&
    typeof value.statement==='string'&&value.statement.trim().length>=8 &&
    when!==null && when<=now;
}
function scopedObservation(raw,workspaceId,def,now,maxAgeMs){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||!VALID_STATES.has(raw.status))return {state:'missing'};
  if(raw.status==='withheld')return {state:'withheld'};
  if(raw.status==='not_connected')return {state:'missing'};
  // These checks reject cross-workspace, arbitrary source and undocumented readings.
  // They DO NOT verify auth; only a server-side scope-authorized source adapter may call this.
  if(raw.workspaceId!==workspaceId||raw.authorization!=='authorized_scoped_aggregate'||
    raw.source!==def.source)return {state:'unverified'};
  const time=parsedTime(raw.observedAt);
  if(time===null||time>now)return {state:'unverified'};
  if(raw.value!=null && (typeof raw.value!=='number'||!Number.isFinite(raw.value)))return {state:'unverified'};
  if(raw.status==='issue' && (typeof raw.findingRef!=='string'||!/^ev:[A-Za-z0-9_-]{4,90}$/.test(raw.findingRef)))return {state:'unverified'};
  const ageDays=Math.floor((now-time)/86400000);
  if(now-time>maxAgeMs)return {state:'stale',observedAt:raw.observedAt,ageDays};
  return {
    state:raw.status,observedAt:raw.observedAt,ageDays,
    source:def.source,value:raw.value??null,
    ...(raw.status==='issue'?{findingRef:raw.findingRef}:{}),
  };
}
export function assessGrowthEvidenceReadiness({
  workspaceId,profile='general',purposeConfirmation=null,observations={},asOf,maxAgeDays=90
}={}){
  const id=safeId(workspaceId);
  if(!id)throw new TypeError('A validated immutable workspaceId is required');
  if(!Object.hasOwn(GROWTH_PROFILES,profile))throw new TypeError('Known purpose profile required');
  const now=parsedTime(asOf);
  if(now===null)throw new TypeError('A deterministic ISO asOf is required');
  const age=Number(maxAgeDays);
  if(!Number.isInteger(age)||age<1||age>365)throw new RangeError('maxAgeDays must be 1..365');
  const input=observations&&typeof observations==='object'&&!Array.isArray(observations)?observations:{};
  const purposeVerified=confirmedPurpose(purposeConfirmation,id,profile,now);
  const dimensions=GROWTH_DIMENSIONS.map(def=>{
    const state=scopedObservation(Object.hasOwn(input,def.id)?input[def.id]:null,id,def,now,age*86400000);
    return Object.freeze({id:def.id,label:def.label,priority:GROWTH_PROFILES[profile].focus.includes(def.id),...state});
  });
  const counts={
    observed:dimensions.filter(d=>d.state==='observed').length,
    issues:dimensions.filter(d=>d.state==='issue').length,
    stale:dimensions.filter(d=>d.state==='stale').length,
    withheld:dimensions.filter(d=>d.state==='withheld').length,
    unverified:dimensions.filter(d=>d.state==='unverified').length,
    missing:dimensions.filter(d=>d.state==='missing').length,
  };
  const actions=[];
  if(!purposeVerified)actions.push({type:'confirm_purpose',authority:'accountable_org_owner',mode:'human_review'});
  for(const dim of dimensions){
    if(dim.state==='missing')actions.push({type:'connect_scoped_evidence',dimension:dim.id,authority:'workspace_authorized_adapter',mode:'read_only'});
    if(dim.state==='stale')actions.push({type:'refresh_stale_evidence',dimension:dim.id,authority:'workspace_authorized_adapter',mode:'read_only'});
    if(dim.state==='unverified')actions.push({type:'resolve_evidence_provenance',dimension:dim.id,authority:'security_reviewer',mode:'human_review'});
    if(dim.state==='issue')actions.push({type:'review_documented_issue',dimension:dim.id,authority:'accountable_org_owner',mode:'human_review',findingRef:dim.findingRef});
  }
  const connected=counts.observed+counts.issues;
  const readiness=!purposeVerified?'purpose_unconfirmed':
    counts.issues?'review_required':
    connected===0?'no_verified_evidence':
    counts.stale||counts.unverified||counts.missing||counts.withheld?'partial_evidence':'evidence_available';
  return Object.freeze({
    policy:GROWTH_ASSESSMENT_POLICY.id,workspaceId:id,
    profile:{id:profile,label:GROWTH_PROFILES[profile].label},
    asOf,purposeConfirmed:purposeVerified,readiness,
    evidenceCoverage:{total:dimensions.length,...counts},
    dimensions:Object.freeze(dimensions),
    recommendedActions:Object.freeze(actions.map(a=>Object.freeze(a))),
    governance:{
      authority:'EKODI Orchestrator + local workspace owner',
      scope:'injected_authorized_aggregate_evidence_only',
      noSideEffects:true,noCrossTenantJoin:true,requiresHumanDecision:true,
    },
    interpretation:'Evidence readiness is not organizational success, growth, trust ranking, cash forecast, impact rating or permission to execute changes.',
  });
}
