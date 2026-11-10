// Site-owned AI -> EKODI Orchestrator contract. Pure, provider-neutral;
// does not authenticate HTTP requests, grant capability, execute commands or mutate production.
// Caller MUST supply verified Person + Workspace + Role + Capability authority.
export const SITE_SEARCH_REPORT_VERSION=1;
const STATUS=new Set(['healthy','needs_action','pending','failed','unknown']);
const TYPES=new Set(['seo_technical','content_recommendation','free_promotion','indexnow_submission','provider_evidence']);
const ACTIONS=new Set(['recheck','repair_reversible','request_evidence','request_human_approval','escalate']);
const safe=(v,n=200)=>String(v??'').trim().slice(0,n);
const canonicalSiteUrl=value=>{
  const u=new URL(value);
  if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash)throw new Error('INVALID_SITE_URL');
  return u.origin+u.pathname.replace(/\/+$/,'')+'/';
};
const safeEvidenceLink=value=>{
  if(!value)return '';
  const u=new URL(value);
  if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash)throw new Error('INVALID_EVIDENCE_URL');
  return u.href;
};
export function normalizeSiteAiReport(input,authority,clock=()=>new Date().toISOString()){
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('INVALID_REPORT');
  if(!authority||authority.delegated!==true||authority.audited!==true||authority.canReport!==true)
    throw new Error('DELEGATED_SITE_REPORT_AUTHORITY_REQUIRED');
  const workspaceId=safe(authority.workspaceId,128);
  const siteUrl=canonicalSiteUrl(authority.canonicalSiteUrl);
  if(!workspaceId||safe(input.workspaceId,128)!==workspaceId)throw new Error('WORKSPACE_MISMATCH');
  if(canonicalSiteUrl(input.siteUrl)!==siteUrl)throw new Error('SITE_MISMATCH');
  const capability=safe(input.capability,64),status=safe(input.status,32);
  if(!TYPES.has(capability)||!STATUS.has(status))throw new Error('INVALID_CAPABILITY_OR_STATUS');
  if(!Array.isArray(input.evidence)||input.evidence.length>12)throw new Error('INVALID_EVIDENCE');
  const evidence=input.evidence.map(entry=>{
    if(!entry||typeof entry!=='object')throw new Error('INVALID_EVIDENCE');
    const kind=safe(entry.kind,48);
    if(!['internal_receipt','public_url','provider_receipt','manual_pending'].includes(kind))
      throw new Error('INVALID_EVIDENCE_KIND');
    return Object.freeze({kind,href:safeEvidenceLink(entry.href),receiptId:safe(entry.receiptId,128)});
  });
  // This contract never accepts credential payloads or arbitrary private message bodies.
  if(Object.keys(input).some(key=>/token|secret|credential|password|private|api_?key/i.test(key)))
    throw new Error('SENSITIVE_FIELD_FORBIDDEN');
  const verifiedProviderReceipts=new Set(Array.isArray(authority.verifiedProviderReceiptIds)?authority.verifiedProviderReceiptIds:[]);
  const providerVerified=evidence.some(item=>item.kind==='provider_receipt'&&item.receiptId&&verifiedProviderReceipts.has(item.receiptId));
  const observedAt=clock();
  if(!Number.isFinite(Date.parse(observedAt)))throw new Error('INVALID_OBSERVATION_TIME');
  return Object.freeze({
    version:SITE_SEARCH_REPORT_VERSION,
    workspaceId,siteUrl,capability,status,
    runId:safe(input.runId,128),observedAt,
    completedCount:Number.isSafeInteger(input.completedCount)&&input.completedCount>=0?input.completedCount:null,
    failedCount:Number.isSafeInteger(input.failedCount)&&input.failedCount>=0?input.failedCount:null,
    evidence:Object.freeze(evidence),providerVerified,
    reportingActor:safe(authority.actorId,128),
    // No site content, customer data, provider tokens or reusable credentials.
  });
}
export function proposeCentralFollowUp(report,{allowedActions=['recheck','request_evidence'],humanApproved=false}={}){
  if(!report||report.version!==SITE_SEARCH_REPORT_VERSION||!report.workspaceId||!report.siteUrl)
    throw new Error('INVALID_VERIFIED_REPORT');
  const available=new Set(allowedActions.filter(action=>ACTIONS.has(action)));
  let suggestion=report.status==='failed'?'repair_reversible':
    report.status==='needs_action'?'recheck':
    report.status==='pending'?'request_evidence':
    report.status==='unknown'?'request_evidence':
    report.providerVerified?'recheck':'request_evidence';
  if(!available.has(suggestion))suggestion=available.has('recheck')?'recheck':available.has('request_evidence')?'request_evidence':'escalate';
  const requiresHuman=suggestion==='request_human_approval'||suggestion==='escalate';
  return Object.freeze({
    workspaceId:report.workspaceId,siteUrl:report.siteUrl,capability:report.capability,
    proposedAction:suggestion,executionAuthorized:false,
    requiresHumanApproval:requiresHuman,
    // Suggested actions are non-executing until tenant-local capability, policy and human gate verify.
    instructionState:'proposal_only',correlationRunId:report.runId,
  });
}
