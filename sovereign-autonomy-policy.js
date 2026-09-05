const A4_FLAGS=['constitutionChange','reducesUserRights','permissionExpansion','canonicalIdentityChange','workspaceAuthorityChange','irreversibleDataChange','massDataChange','newDomainOwnership','securityBoundaryChange','legalCommitment','providerLockIn','newIndependentDeployment','regulatedProductCommitment'];
const A4_AREAS=new Set(['production_secret_change','production_dns_change','repository_force_push','repository_delete','new_domain_ownership_or_security_boundary','permission_expanding_or_root_secret_change','canonical_identity_or_workspace_authority_change','irreversible_or_authority_expanding_production_rollback']);
const A5_FLAGS=['guardrailBypass','testBypass','secretExfiltration','unauthorizedCrossTenantData','coerciveManipulation','hiddenHighImpactAutomation'];
export function classifyAutonomyLevel(action={}){
  if(A5_FLAGS.some(k=>action[k]===true)||action.forbidden===true)return 'A5';
  if(action.highImpact===true||A4_AREAS.has(String(action.area||'')))return 'A4';
  if(A4_FLAGS.some(k=>action[k]===true))return 'A4';
  if(action.paidCommitment===true&&action.explicitDelegatedBudget!==true)return 'A4';
  if(action.readOnly===true)return 'A0';
  if(action.analysisOnly===true)return 'A1';
  if(action.production===true){
    const ok=action.delegated===true&&action.existingBoundary===true&&action.reversible===true&&action.preflightVerified===true&&action.postVerificationRequired===true&&action.automaticRollback===true&&action.logged===true;
    return ok?'A3':'A4';
  }
  if(action.reversible===true&&action.delegated===true&&action.production!==true)return 'A2';
  return 'A4';
}
export function evaluateAutonomyEnvelope(action={}){
  const level=classifyAutonomyLevel(action);
  return Object.freeze({level,automaticAllowed:['A0','A1','A2','A3'].includes(level),sovereignDecisionRequired:level==='A4',forbidden:level==='A5',policy:'EKODI Sovereign Autonomy v1'});
}
