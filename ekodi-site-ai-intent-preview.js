// EKODI Site AI intent preview contract. Read-only; caller must validate authenticated role and source registries.
// No workspace membership/authority can be inferred from a site id or canonical URL.
const ACTIONS=new Set(["observe","draft","create","update","repair","publish","delete","bulk_delete","change_permissions","billing_commitment","secrets","release","robot_actuate"]);
const SCOPE=new Set(["site_specific","shared_service_engine","platform_common"]);
const HUMAN=new Set(["publish","delete","bulk_delete","change_permissions","billing_commitment","secrets","release","robot_actuate"]);
const NO_AUTO=new Set(["bulk_delete","billing_commitment","secrets","robot_actuate"]);
const clean=(value,max=160)=>String(value??"").trim().slice(0,max);

export function previewSiteAiMicroIntent(input={},catalog={}){
  if(!input||typeof input!=="object"||Array.isArray(input))throw new Error("INVALID_INTENT_INPUT");
  const action=clean(input.action,40),scope=clean(input.scope,45),capabilityId=clean(input.capabilityId,100);
  if(!ACTIONS.has(action)||!SCOPE.has(scope))throw new Error("UNKNOWN_ACTION_OR_SCOPE");
  const capability=(catalog.capabilities?.capabilities||[]).find(item=>item.id===capabilityId);
  if(!capability)throw new Error("UNREGISTERED_CAPABILITY");
  if(capability.actionTier==="forbidden")throw new Error("FORBIDDEN_CAPABILITY");
  const siteId=clean(input.siteId,100);
  if(scope==="site_specific"&&!siteId)throw new Error("SITE_REQUIRED");
  const site=siteId?(catalog.sites?.existingWorkspaceSites||[]).find(item=>item.id===siteId):null;
  if(siteId&&(!site||site.class!=="workspace_user_site"||/planned|preparing|pending/i.test(clean(site.migrationState))))throw new Error("UNREGISTERED_OR_UNAVAILABLE_SITE");
  if(scope==="site_specific"&&!site)throw new Error("SITE_REQUIRED");
  const canonical=site?clean(site.canonicalUrl,240):"";
  if(site&&!/^https:\/\/ekodi\.kr\/[a-z0-9-]+\/?$/i.test(canonical))throw new Error("CANONICAL_SITE_ROUTE_REQUIRED");
  const material=input.material===true||input.irreversible===true||input.reducesUserRights===true;
  const requiresHuman=HUMAN.has(action)||material||capability.actionTier==="human_gate";
  const requiresRelease=input.codeChange===true;
  const sitePath=site?canonical.slice("https://ekodi.kr".length).replace(/\/$/,""):"";
  return Object.freeze({
    contract:"ekodi.site-ai.micro-intent-preview.v1",
    status:"proposal_only",
    siteId:site?.id||null,
    workspaceId:null,
    workspaceIdentityVerified:false,
    capabilityId,
    scope,
    action,
    // Scope candidates are not verified site-AI registrations or task assignments.
    proposedOwnerRole:scope==="site_specific"?"site_ai":"ekodi_orchestrator",
    ownerAgentId:null,
    siteAiRegistrationVerified:false,
    contributingSiteId:scope==="site_specific"?null:(site?.id||null),
    releaseRequired:requiresRelease,
    releaseClassificationVerified:false,
    humanApprovalRequired:requiresHuman,
    finalHumanGateDeterminedByOrchestrator:true,
    neverAutoExecute:NO_AUTO.has(action),
    requiredNextStep:requiresHuman?"exact_authenticated_human_gate":requiresRelease?"ekodi_orchestrator_release_task":"orchestrator_scoped_preflight",
    detailPath:scope==="site_specific"?`${sitePath}/admin`:"/admin",
    nativeSiteContextRequired:scope==="site_specific",
    providerSelection:"free_verified_quota_then_core",
    automaticPaidBudgetKrw:0,
    paidAutoEscalation:false,
    coreFallbackRequired:true,
    executionAuthorized:false,
    deploymentAuthorized:false,
    productionVerified:false,
    // Do not mirror raw instructions, PII, model output or speculative task identity in central summaries.
  });
}

export function proposeMicroIntentOwnerNotice(plan,{kind="approval_required",paidChannelReceiptVerified=false,kakaoTemplateVerified=false}={}){
  if(!plan||plan.contract!=="ekodi.site-ai.micro-intent-preview.v1")throw new Error("INVALID_PLAN");
  if(!["approval_required","failed_verified","completed_verified"].includes(kind))throw new Error("INVALID_NOTICE_KIND");
  if(kind==="approval_required"&&!plan.humanApprovalRequired)throw new Error("NO_HUMAN_APPROVAL_REQUIRED");
  return Object.freeze({
    channel:"ekodi_inbox",
    optionalChannels:paidChannelReceiptVerified===true?["webpush","sms",...(kakaoTemplateVerified===true?["kakao_eligible_only"]:[])]:["webpush"],
    title:kind==="approval_required"?"중요 변경 승인 필요":kind==="completed_verified"?"검증된 작업 결과":"작업 오류 확인",
    body:"자세한 내용은 EKODI 로그인 후 확인해 주세요.",
    detailPath:plan.detailPath,
    grantsApproval:false,
    containsSecret:false,
    containsPrivateData:false,
    dispatchAuthorized:false,
  });
}

export function requiredMicroIntentEvidence(plan){
  if(!plan||plan.contract!=="ekodi.site-ai.micro-intent-preview.v1")throw new Error("INVALID_PLAN");
  const mandatory=["orchestratorTaskId","authorityReceipt","independentVerifier","verifiedActualOutcome","auditReceiptId"];
  if(plan.nativeSiteContextRequired)mandatory.push("verifiedWorkspaceId","siteLocalMembership");
  if(plan.humanApprovalRequired)mandatory.push("exactHumanGateReceipt");
  if(plan.releaseRequired)mandatory.push("branchRef","prNumber","commitSha","requiredCi","staging","guardedDeployment","productionHost","mobileAndDesktopFunctionalVerification","productionClaimReceipt");
  return Object.freeze({source:"authoritative_ekodi_orchestrator_only",mandatory:Object.freeze(mandatory),claimVerified:false});
}
