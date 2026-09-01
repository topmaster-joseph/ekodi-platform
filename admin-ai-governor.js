(() => {
  'use strict';
  if (window.EKODIAdminAIGovernor) return;

  const VERSION='2.0.2';
  const RISK={LOW:'low',MEDIUM:'medium',HIGH:'high',CRITICAL:'critical'};
  const HUMAN_GATE=new Set(['production_secret','dns_change','data_delete','permission_change','force_push','repository_delete','production_rollback','high_cost_ai']);
  const FREE_FIRST=Object.freeze(['deterministic_rule','internal_api','cached_context','free_ai','low_cost_ai','premium_ai']);

  function normalize(input){return String(input||'').trim().toLowerCase()}
  function containsAny(text,words){return words.some(word=>text.includes(word))}

  function classifyIntent(request){
    const text=normalize(request);const dimensions=[];
    if(containsAny(text,['worker','cloudflare','domain','도메인','dns','route']))dimensions.push('infrastructure');
    if(containsAny(text,['github','repository','repo','branch','commit','코드','actions']))dimensions.push('development');
    if(containsAny(text,['deploy','배포','rollback','롤백','build','빌드']))dimensions.push('devops');
    if(containsAny(text,['secret','권한','auth','인증','보안']))dimensions.push('security');
    if(containsAny(text,['db','database','데이터','backup','백업','migration']))dimensions.push('data');
    if(containsAny(text,['ai','openai','api','gateway','모델']))dimensions.push('ai_gateway');
    return dimensions.length?dimensions:['chief'];
  }

  function expandContext(request){
    const specialists=classifyIntent(request);const related=new Set(['service_registry','health','recent_changes']);
    if(specialists.includes('infrastructure'))['routes','custom_domains','workers','deployment_manifest'].forEach(x=>related.add(x));
    if(specialists.includes('development'))['repository','branch','actions','deployment_manifest'].forEach(x=>related.add(x));
    if(specialists.includes('devops'))['build','deployment','health','rollback_point'].forEach(x=>related.add(x));
    if(specialists.includes('security'))['auth','permissions','secrets','audit_log'].forEach(x=>related.add(x));
    if(specialists.includes('data'))['database','backup','migration','integrity'].forEach(x=>related.add(x));
    if(specialists.includes('ai_gateway'))['provider_health','model_policy','budget','fallback'].forEach(x=>related.add(x));
    return {specialists,related:[...related]};
  }

  function declaredPolicy(actionType){
    if(!actionType)return null;
    const control=globalThis.EKODIAgenticControl;
    if(!control?.policy)return {
      known:false,allowed:false,action:String(actionType),risk:RISK.CRITICAL,autonomy:'A3',approval:'explicit_human',
      evidence:['audit','trace'],rollback:null,reason:'control_registry_unavailable'
    };
    return control.policy(actionType)||{
      known:false,allowed:false,action:String(actionType),risk:RISK.CRITICAL,autonomy:'A3',approval:'explicit_human',
      evidence:['audit','trace'],rollback:null,reason:'control_registry_unavailable'
    };
  }

  function assessRisk(request,action={}){
    const declared=declaredPolicy(action.type);
    if(declared){
      const blocked=declared.allowed===false;
      return {
        risk:declared.risk,
        humanApprovalRequired:blocked||declared.approval!=='none',
        gate:blocked?(declared.reason||'unregistered_action'):(declared.approval==='none'?null:`action:${declared.action}`),
        source:declared.known?'action_registry':'action_registry_fail_closed',
        autonomy:declared.autonomy,
        evidence:declared.evidence,
        rollback:declared.rollback||null,
        blocked,
        reason:declared.reason||null,
      };
    }

    const text=normalize(`${request} ${action.type||''} ${action.target||''}`);let risk=RISK.LOW;let gate=null;
    const checks=[
      ['repository_delete',['repository delete','repo delete','저장소 삭제']],['force_push',['force push','강제 push','강제푸시']],
      ['production_secret',['production secret','프로덕션 secret','secret 변경']],['dns_change',['dns change','dns 변경','도메인 변경']],
      ['data_delete',['data delete','데이터 삭제','db delete']],['permission_change',['permission change','권한 변경']],
      ['production_rollback',['production rollback','프로덕션 rollback','운영 롤백']],
    ];
    for(const [candidate,words] of checks){if(containsAny(text,words)){risk=RISK.CRITICAL;gate=candidate;break}}
    if(!gate&&containsAny(text,['deploy','배포','write','update','수정','재실행','rerun']))risk=RISK.MEDIUM;
    if(action.estimatedCostKrw>=1000){risk=risk===RISK.CRITICAL?risk:RISK.HIGH;gate=gate||'high_cost_ai'}
    return {risk,humanApprovalRequired:Boolean(gate&&HUMAN_GATE.has(gate)),gate,source:'legacy_intent_fallback',blocked:false};
  }

  function chooseExecutionTier(task={}){
    if(task.deterministic!==false)return {tier:'deterministic_rule',reason:'AI 호출 없이 규칙/API로 처리 가능'};
    if(task.internalApi)return {tier:'internal_api',reason:'EKODI 내부 API로 처리 가능'};
    if(task.cachedContext)return {tier:'cached_context',reason:'기존 검증 컨텍스트 재사용 가능'};
    if((task.complexity||'low')==='low')return {tier:'free_ai',reason:'무료 AI로 충분한 저복잡도 작업'};
    if((task.complexity||'medium')==='medium')return {tier:'low_cost_ai',reason:'저비용 모델로 충분한 중간 복잡도'};
    return {tier:'premium_ai',reason:'고복잡도 또는 긴급 복구에 고성능 모델 필요'};
  }

  function plan(request,options={}){
    const context=expandContext(request);
    const execution=chooseExecutionTier({deterministic:options.deterministic,internalApi:options.internalApi,cachedContext:options.cachedContext,complexity:options.complexity});
    const risk=assessRisk(request,{type:options.actionType,target:options.target,estimatedCostKrw:Number(options.estimatedCostKrw||0)});
    const operation=options.actionType&&globalThis.EKODIAgenticControl?.createOperation
      ?globalThis.EKODIAgenticControl.createOperation({actionId:options.actionType,target:options.target||null,requestedBy:options.requestedBy||null,input:options.input||null})
      :null;
    const next=risk.blocked?'block_unregistered_action':(risk.humanApprovalRequired?'request_human_approval':'execute_then_verify');
    return Object.freeze({version:VERSION,request:String(request||''),context,execution,risk,operation,
      policy:{freeFirst:FREE_FIRST,expandBeyondLiteralRequest:true,minimumNecessaryChange:true,postActionVerification:true,structuredReport:true,evidenceRequired:true},next});
  }

  function verify(result={}){
    const checks=Array.isArray(result.checks)?result.checks:[];const failed=checks.filter(check=>check&&check.ok===false);
    const control=globalThis.EKODIAgenticControl;
    const evidence=result.actionType
      ?(control?.verify?control.verify(result.actionType,result.evidence||[]):{verified:false,required:['audit','trace'],missing:['audit','trace'],reason:'control_registry_unavailable'})
      :null;
    const verified=checks.length>0&&failed.length===0&&(!evidence||evidence.verified);
    return {verified,checks,failed,evidence,requiresFollowup:failed.length>0||Boolean(evidence&&!evidence.verified)};
  }

  function report({request='',plan:planned,result={},verification={},relatedFindings=[]}={}){
    return {request,judgment:planned?.context||{},collaboration:planned?.context?.specialists||[],execution:planned?.execution||{},risk:planned?.risk||{},operation:planned?.operation||null,
      actions:Array.isArray(result.actions)?result.actions:[],verification,relatedFindings,
      outcome:planned?.risk?.blocked?'blocked':(verification.verified?'verified_complete':(planned?.risk?.humanApprovalRequired?'waiting_approval':'needs_followup'))};
  }

  window.EKODIAdminAIGovernor=Object.freeze({VERSION,RISK,HUMAN_GATE,FREE_FIRST,classifyIntent,expandContext,assessRisk,chooseExecutionTier,plan,verify,report});
})();