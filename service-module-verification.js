const CANONICAL_ORIGIN='https://ekodi.kr';

const PROBE_DEFINITIONS=Object.freeze([
  Object.freeze({
    id:'realtime-health',
    path:'/api/realtime/health',
    method:'GET',
    kind:'runtime-contract',
    validate:({status,data})=>status===200&&data?.ok===true&&data?.service==='ekodi-realtime'&&data?.adaptiveMedia===true&&data?.multitenant===true,
  }),
  Object.freeze({
    id:'realtime-live',
    path:'/api/realtime/live?tenant=ekodichurch',
    method:'GET',
    kind:'read-model',
    validate:({status,data})=>status===200&&data?.ok===true&&data?.tenant==='ekodichurch'&&data?.canonicalTenant==='ekodi-church'&&typeof data?.live==='boolean',
  }),
  Object.freeze({
    id:'membership-catalog',
    path:'/api/membership/catalog?site=learn',
    method:'GET',
    kind:'contract-read',
    validate:({status,data})=>status===200&&data?.site==='learn'&&data?.inheritedDefault===true&&Array.isArray(data?.plans)&&data.plans.some(plan=>plan?.id==='free'),
  }),
  Object.freeze({
    id:'content-stores',
    path:'/api/books/public/stores',
    method:'GET',
    kind:'read-model',
    validate:({status,data})=>status===200&&Array.isArray(data?.stores),
  }),
  Object.freeze({
    id:'application-validation',
    path:'/ekodimission/api/activities/260926-chuseok-open-table/applications',
    method:'POST',
    kind:'validation-path',
    body:{},
    expectedStatus:400,
    validate:({status,data})=>status===400&&data?.ok===false&&data?.error==='invalid_name',
  }),
  Object.freeze({
    id:'confirmation-workspaces',
    path:'/api/control/confirmations/workspaces',
    method:'GET',
    kind:'authenticated-read-model',
    forwardAdminAuthorization:true,
    validate:({status,data})=>status===200&&Array.isArray(data?.workspaces),
  }),
  Object.freeze({
    id:'publishing-health',
    path:'/publishing/health',
    method:'GET',
    kind:'runtime-contract',
    validate:({status,data})=>status===200&&data?.ok===true&&data?.service==='ekodi-publishing'&&data?.professionalService===true&&Array.isArray(data?.modules)&&data.modules.includes('production')&&data.modules.includes('distribution'),
  }),
  Object.freeze({
    id:'insurance-health',
    path:'/insurance/health',
    method:'GET',
    kind:'runtime-contract',
    validate:({status,data})=>status===200&&data?.ok===true&&data?.service==='ekodi-insurance'&&data?.canonical==='https://ekodi.kr/insurance',
  }),
  Object.freeze({
    id:'marketing-domain-health',
    path:'/marketing-api/health',
    method:'GET',
    kind:'runtime-contract',
    validate:({status,data})=>status===200&&data?.ok===true&&data?.service==='ekodi-marketing-domain-api'&&data?.authHandoff==='httpOnly-cookie',
  }),
  Object.freeze({
    id:'marketing-publishing-health',
    path:'/marketing-publish-api/health',
    method:'GET',
    kind:'runtime-contract',
    validate:({status,data})=>status===200&&data?.ok===true&&data?.service==='ekodi-marketing-publishing'&&data?.schemaReady===true&&data?.channelAutomationCore===true&&data?.scheduler===true,
  }),
]);

const MODULE_DEFINITIONS=Object.freeze([
  Object.freeze({id:'participant',category:'common',coverage:'verified',probes:['realtime-health','realtime-live'],note:'실시간 참가자 런타임과 테넌트별 라이브 read model을 확인했습니다.'}),
  Object.freeze({id:'member',category:'common',coverage:'partial',probes:['membership-catalog'],note:'회원등급 카탈로그 계약을 확인했습니다. 개인별 가입 상태와 변경 작업은 이 실증 범위에 포함하지 않습니다.'}),
  Object.freeze({id:'content',category:'common',coverage:'verified',probes:['content-stores'],note:'콘텐츠 공개 저장소의 실제 read model을 확인했습니다.'}),
  Object.freeze({id:'application-reservation',category:'common',coverage:'partial',probes:['application-validation'],note:'신청 API의 실제 입력검증 경로를 비파괴 방식으로 확인했습니다. 신청 저장은 생성하지 않습니다.'}),
  Object.freeze({id:'payment-receipt-confirmation',category:'common',coverage:'verified',probes:['confirmation-workspaces'],note:'관리자 권한으로 지급·수령 확인 Workspace 원장을 읽어 실제 DB 연결을 확인했습니다.'}),
  Object.freeze({id:'live',category:'professional',coverage:'verified',probes:['realtime-health','realtime-live'],note:'라이브 런타임과 테넌트별 방송 read model을 확인했습니다.'}),
  Object.freeze({id:'publishing',category:'professional',coverage:'partial',probes:['publishing-health'],note:'출판 전문서비스 런타임과 주요 모듈 계약을 확인했습니다. 실제 외부 출판 제출은 실행하지 않습니다.'}),
  Object.freeze({id:'insurance-engine',category:'professional',coverage:'partial',probes:['insurance-health'],note:'보험 전문서비스의 canonical runtime 계약을 확인했습니다. 상담·가입 업무 쓰기는 실행하지 않습니다.'}),
  Object.freeze({id:'auto-sales',category:'professional',coverage:'partial',probes:['marketing-domain-health','marketing-publishing-health'],note:'마케팅 도메인과 게시 자동화 런타임·스키마·스케줄러를 확인했습니다. 실제 캠페인·게시 쓰기는 실행하지 않습니다.'}),
]);

const PROBE_BY_ID=new Map(PROBE_DEFINITIONS.map(probe=>[probe.id,probe]));
const EVIDENCE_LABELS=Object.freeze({verified:'실증됨',partial:'부분실증',failed:'실증실패',unverified:'미실증'});

function cleanError(error){
  const message=String(error?.message||error||'probe_failed').replace(/Bearer\s+[A-Za-z0-9._~-]+/gi,'Bearer [redacted]');
  return message.slice(0,180);
}

function authorizationFrom(request){
  const raw=String(request?.headers?.get?.('authorization')||'').trim();
  return /^Bearer\s+\S+$/i.test(raw)?raw:'';
}

async function runProbe(probe,request,fetchImpl){
  const started=Date.now();
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort('timeout'),10000);
  const headers=new Headers({'accept':'application/json','user-agent':'EKODI-Module-Evidence/1.0'});
  if(probe.forwardAdminAuthorization){
    const authorization=authorizationFrom(request);
    if(authorization)headers.set('authorization',authorization);
  }
  let body;
  if(probe.body!==undefined){
    headers.set('content-type','application/json');
    headers.set('origin',CANONICAL_ORIGIN);
    body=JSON.stringify(probe.body);
  }
  try{
    const response=await fetchImpl(new URL(probe.path,CANONICAL_ORIGIN).toString(),{
      method:probe.method,
      headers,
      body,
      redirect:'follow',
      signal:controller.signal,
    });
    const data=await response.clone().json().catch(()=>null);
    const ok=Boolean(probe.validate({status:response.status,data,headers:response.headers}));
    return Object.freeze({
      id:probe.id,
      ok,
      kind:probe.kind,
      method:probe.method,
      path:probe.path,
      nonMutating:true,
      httpStatus:response.status,
      responseMs:Date.now()-started,
      checkedAt:new Date().toISOString(),
      detail:ok?'':`expected functional contract was not met (HTTP ${response.status})`,
    });
  }catch(error){
    return Object.freeze({
      id:probe.id,
      ok:false,
      kind:probe.kind,
      method:probe.method,
      path:probe.path,
      nonMutating:true,
      httpStatus:null,
      responseMs:Date.now()-started,
      checkedAt:new Date().toISOString(),
      detail:error?.name==='AbortError'?'timeout':cleanError(error),
    });
  }finally{
    clearTimeout(timer);
  }
}

async function mapWithConcurrency(items,limit,operation){
  const results=new Array(items.length);
  let cursor=0;
  async function worker(){
    while(cursor<items.length){
      const index=cursor++;
      results[index]=await operation(items[index]);
    }
  }
  await Promise.all(Array.from({length:Math.min(limit,items.length)},()=>worker()));
  return results;
}

function moduleEvidence(definition,resultById){
  const probes=definition.probes.map(id=>resultById.get(id)).filter(Boolean);
  const passed=probes.filter(item=>item.ok).length;
  const allPassed=probes.length===definition.probes.length&&passed===probes.length;
  const evidence=allPassed?definition.coverage:'failed';
  const failedIds=probes.filter(item=>!item.ok).map(item=>item.id);
  const checkedAt=probes.reduce((latest,item)=>String(item.checkedAt||'')>latest?String(item.checkedAt||''):latest,'');
  return Object.freeze({
    id:definition.id,
    category:definition.category,
    evidence,
    label:EVIDENCE_LABELS[evidence],
    note:allPassed?definition.note:`실증 실패: ${failedIds.join(', ')||'required probe missing'}`,
    checkedAt,
    probeCount:definition.probes.length,
    passedProbeCount:passed,
    productionWrites:false,
    probes:probes.map(item=>Object.freeze({
      id:item.id,ok:item.ok,kind:item.kind,method:item.method,path:item.path,nonMutating:true,
      httpStatus:item.httpStatus,responseMs:item.responseMs,checkedAt:item.checkedAt,detail:item.detail,
    })),
  });
}

export async function runServiceModuleFunctionalVerification(request,{fetchImpl=fetch}={}){
  if(typeof fetchImpl!=='function')throw new TypeError('fetchImpl must be a function');
  const results=await mapWithConcurrency(PROBE_DEFINITIONS,4,probe=>runProbe(probe,request,fetchImpl));
  const resultById=new Map(results.map(result=>[result.id,result]));
  const modules=MODULE_DEFINITIONS.map(definition=>moduleEvidence(definition,resultById));
  return Object.freeze({
    schemaVersion:1,
    generatedAt:new Date().toISOString(),
    policy:'read-only-functional-evidence',
    productionWrites:false,
    summary:Object.freeze({
      total:modules.length,
      verified:modules.filter(module=>module.evidence==='verified').length,
      partial:modules.filter(module=>module.evidence==='partial').length,
      failed:modules.filter(module=>module.evidence==='failed').length,
    }),
    modules,
  });
}

export function serviceModuleFunctionalVerificationContract(){
  return Object.freeze({
    origin:CANONICAL_ORIGIN,
    productionWrites:false,
    probes:PROBE_DEFINITIONS.map(probe=>Object.freeze({
      id:probe.id,path:probe.path,method:probe.method,kind:probe.kind,nonMutating:true,
      forwardAdminAuthorization:probe.forwardAdminAuthorization===true,
    })),
    modules:MODULE_DEFINITIONS.map(definition=>Object.freeze({
      id:definition.id,category:definition.category,coverage:definition.coverage,probes:[...definition.probes],
    })),
  });
}
