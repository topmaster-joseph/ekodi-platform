const LAYERS=Object.freeze([
  Object.freeze({rank:1,id:'runtime',label:'Runtime'}),
  Object.freeze({rank:2,id:'guarded-deploy',label:'Deploy'}),
  Object.freeze({rank:3,id:'cloud-control',label:'Cloud Control'}),
  Object.freeze({rank:4,id:'owner',label:'Owner'}),
]);

const OWNER_INTENTS=new Set([
  'provider_plan_change','paid_cost_commitment','limit_increase_request','account_change',
  'billing_change','identity_ownership_change','root_security_change'
]);
const RUNTIME_INTENTS=new Set([
  'read_only','health','diagnostics','content_update','existing_feature_flag',
  'existing_runtime_config','cache_policy','safe_static_degrade'
]);
const CLOUD_CONTROL_INTENTS=new Set([
  'infrastructure_repair','workers_build_trigger_repair','route_repair','build_configuration_repair'
]);

function bool(value){return value===true}
function id(value){return String(value||'').trim().toLowerCase().replace(/[- ]+/g,'_')}

export function deploymentLayerOrder(){return LAYERS}

export function selectDeploymentLayer(input={}){
  const intent=id(input.intent);
  const codeChange=bool(input.codeChange);
  const securityCritical=bool(input.securityCritical);
  const runtimeSupported=bool(input.runtimeSupported);
  const guardedDeployAvailable=input.guardedDeployAvailable!==false;
  const githubActionsWranglerAvailable=input.githubActionsWranglerAvailable!==false;
  const cloudControlAuthorized=bool(input.cloudControlAuthorized);
  const cloudControlAllowlisted=bool(input.cloudControlAllowlisted);
  const runtimeQuotaExhausted=bool(input.runtimeQuotaExhausted);
  const workersBuildsExhausted=bool(input.workersBuildsExhausted);
  const ownerApproval=bool(input.ownerApproval);

  if(OWNER_INTENTS.has(intent)){
    return Object.freeze({
      rank:4,layer:'owner',reason:'owner-authority-required',automatic:false,
      allowed:ownerApproval,requiresHumanApproval:true
    });
  }

  if(!codeChange&&runtimeSupported&&RUNTIME_INTENTS.has(intent)){
    if(runtimeQuotaExhausted&&securityCritical){
      return Object.freeze({
        rank:4,layer:'owner',reason:'security-critical-runtime-capacity-exhausted',
        automatic:false,allowed:false,requiresHumanApproval:true
      });
    }
    return Object.freeze({
      rank:1,layer:'runtime',
      reason:runtimeQuotaExhausted?'safe-static-or-cached-degraded-runtime':'runtime-path-available',
      automatic:true,allowed:true,requiresHumanApproval:false
    });
  }

  if(codeChange&&guardedDeployAvailable&&githubActionsWranglerAvailable){
    return Object.freeze({
      rank:2,layer:'guarded-deploy',
      reason:workersBuildsExhausted?'external-ci-wrangler-bypasses-workers-builds':'default-code-release',
      automatic:true,allowed:true,requiresHumanApproval:false,
      cloudflareWorkersBuildsRequired:false
    });
  }

  if(CLOUD_CONTROL_INTENTS.has(intent)&&cloudControlAuthorized&&cloudControlAllowlisted){
    return Object.freeze({
      rank:3,layer:'cloud-control',reason:'allowlisted-break-glass-infrastructure-repair',
      automatic:false,allowed:true,requiresHumanApproval:true,
      serviceDeploymentLane:false,returnsTo:'guarded-deploy'
    });
  }

  return Object.freeze({
    rank:4,layer:'owner',reason:'no-authorized-lower-layer',
    automatic:false,allowed:ownerApproval,requiresHumanApproval:true
  });
}

export function explainFourLayerFallback(input={}){
  const choice=selectDeploymentLayer(input);
  return Object.freeze({
    policyId:'EKODI-DEPLOYMENT-FOUR-LAYER-001',
    priority:LAYERS.map(x=>x.id),
    choice,
    automaticPaidUpgrade:false,
    preserveSecurityBoundary:true
  });
}
