const TASK_NATIVE_ORDER = Object.freeze({
  'browser-ui-validation': ['ekodi-background-browser-worker'],
  'synthetic-surface-verification': ['ekodi-background-browser-worker','autonomous-execution-fabric'],
  'isolated-browser-execution': ['ekodi-background-browser-worker'],
  'isolated-desktop-execution': ['ekodi-native-remote-computer'],
  'computer-use-automation': ['ekodi-native-remote-computer'],
  'isolated-engineering-execution': ['autonomous-execution-fabric'],
});

export const VIRTUALIZATION_FALLBACK_REASONS = Object.freeze([
  'native-capability-not-production-ready',
  'native-capability-unavailable',
  'required-capability-not-yet-implemented',
  'native-capacity-or-runtime-failure',
]);

const text=(value,max=200)=>String(value??'').trim().slice(0,max);
const asArray=value=>Array.isArray(value)?value:[];

function providerMap(providers){
  return new Map(asArray(providers).filter(Boolean).map(item=>[text(item.id,120),item]));
}

function nativeUsable(provider, taskClass){
  if(!provider) return false;
  if(provider.ownership && provider.ownership!=='ekodi') return false;
  const state=text(provider.state,80);
  const stateReady=provider.ready===true || state==='ready' || state==='runtime-proven' || state==='online';
  if(!stateReady || provider.healthy!==true) return false;
  const capabilities=asArray(provider.taskClasses||provider.capabilities);
  return capabilities.length===0 || capabilities.includes(taskClass);
}

function fail(code,message,details={}){
  return {ok:false,code,message,details};
}

export function selectVirtualizationProvider(input={}){
  const taskClass=text(input.taskClass,120);
  const eligibleIds=TASK_NATIVE_ORDER[taskClass];
  if(!eligibleIds) return fail('VIRTUALIZATION_TASK_CLASS_UNKNOWN','Unknown virtualization task class',{taskClass});

  const nativeById=providerMap(input.nativeProviders);
  const eligibleNative=eligibleIds.map(id=>nativeById.get(id)||{id,state:'missing',healthy:false,ownership:'ekodi'});
  const usable=eligibleNative.find(item=>nativeUsable(item,taskClass));

  if(usable){
    return {
      ok:true,
      providerType:'native',
      providerId:usable.id,
      taskClass,
      reason:'eligible-native-healthy',
      fallback:false,
      constitutionalPolicy:'VIRTUALIZATION-SOVEREIGNTY-001',
      routingPolicy:'EKODI-VIRTUALIZATION-ROUTING-001'
    };
  }

  const fallback=input.externalFallback||null;
  if(!fallback){
    return fail('NATIVE_VIRTUALIZATION_REQUIRED','No eligible EKODI-native virtualization provider is currently usable and no audited fallback was supplied',{
      taskClass,
      eligibleNative:eligibleNative.map(x=>({id:x.id,state:x.state||'unknown',healthy:x.healthy===true})),
      requiredAction:'build-or-recover-ekodi-native-capability'
    });
  }

  const reason=text(fallback.reason,120);
  if(!VIRTUALIZATION_FALLBACK_REASONS.includes(reason)){
    return fail('EXTERNAL_FALLBACK_REASON_FORBIDDEN','External virtualization fallback reason is not allowed',{reason});
  }
  if(fallback.paidUpgrade===true){
    return fail('EXTERNAL_FALLBACK_PAID_UPGRADE_FORBIDDEN','Paid external virtualization auto-upgrade is forbidden');
  }
  if(fallback.securityEquivalentOrStronger!==true){
    return fail('EXTERNAL_FALLBACK_SECURITY_NOT_PROVEN','External fallback must preserve or improve security and isolation');
  }
  const auditId=text(fallback.auditId,160);
  const nativeGapRecord=text(fallback.nativeCapabilityGapRecord,200);
  if(!auditId || !nativeGapRecord){
    return fail('EXTERNAL_FALLBACK_AUDIT_REQUIRED','External fallback requires an audit id and native capability gap record');
  }

  const failures=providerMap(fallback.nativeFailures);
  const missingEvidence=eligibleIds.filter(id=>{
    const evidence=failures.get(id);
    if(!evidence) return true;
    const evidenceReason=text(evidence.reason,120);
    return !VIRTUALIZATION_FALLBACK_REASONS.includes(evidenceReason);
  });
  if(missingEvidence.length){
    return fail('EXTERNAL_FALLBACK_NATIVE_FAILURE_EVIDENCE_REQUIRED','All eligible native providers must have explicit allowed failure evidence before external fallback',{
      missingEvidence
    });
  }

  const externalCandidates=asArray(input.externalProviders).filter(item=>item && item.enabled===true && item.approved===true);
  const selected=externalCandidates.find(item=>{
    if(item.paidUpgradeRequired===true) return false;
    if(item.securityEquivalentOrStronger!==true) return false;
    return true;
  });
  if(!selected){
    return fail('EXTERNAL_FALLBACK_PROVIDER_UNAVAILABLE','No approved security-equivalent external fallback provider is available');
  }

  return {
    ok:true,
    providerType:'external-fallback',
    providerId:text(selected.id,120),
    taskClass,
    reason,
    fallback:true,
    auditId,
    nativeCapabilityGapRecord:nativeGapRecord,
    nativeFailures:eligibleIds.map(id=>({id,reason:text(failures.get(id)?.reason,120)})),
    retryNativeNextExecution:true,
    constitutionalPolicy:'VIRTUALIZATION-SOVEREIGNTY-001',
    routingPolicy:'EKODI-VIRTUALIZATION-ROUTING-001'
  };
}

export function nativeVirtualizationRequired(taskClass){
  return Boolean(TASK_NATIVE_ORDER[text(taskClass,120)]);
}

export function eligibleNativeVirtualizationProviders(taskClass){
  return [...(TASK_NATIVE_ORDER[text(taskClass,120)]||[])];
}
