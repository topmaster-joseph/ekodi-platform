import { runAiEnhancedTask } from './ai-resilience-runtime.js';
import { auditPrincipal, resolveWorkspacePrincipal } from './ekodi-principal.js';
import { d1SchemaReady } from './d1-schema-readiness.js';

export const PROFILE_ENTITY_TYPES=Object.freeze(['person','organization','business','project']);
export const PROFILE_SOURCE_CLASSES=Object.freeze(['official','verified','public','user','ai_inference','needs_check']);
export const PROFILE_SOURCE_LABELS=Object.freeze({
  official:'OFFICIAL',
  verified:'VERIFIED',
  public:'PUBLIC',
  user:'USER',
  ai_inference:'AI INFERENCE',
  needs_check:'NEEDS CHECK',
});

const ENTITY_TYPES=new Set(PROFILE_ENTITY_TYPES);
const SOURCE_CLASSES=new Set(PROFILE_SOURCE_CLASSES);
const STRONG_SOURCES=new Set(['official','verified','public']);
const DISCOVERY_SOURCES=new Set(['official','verified','public']);
const CONFIRM_ACTIONS=new Set(['confirm','correct','reject']);
const SOURCE_RANK=Object.freeze({official:600,verified:500,public:400,user:300,ai_inference:200,needs_check:100});
const REVIEW_RANK=Object.freeze({corrected:10000,confirmed:9000,unreviewed:0,rejected:-100000});
const nowIso=()=>new Date().toISOString();
const clean=(value,max=240)=>String(value??'').trim().slice(0,max);
const newKey=prefix=>`${prefix}_${crypto.randomUUID().replaceAll('-','')}`;

function safeParse(value,fallback=null){try{return JSON.parse(value)}catch{return fallback}}
function jsonValue(value){
  if(value===undefined)return null;
  try{const text=JSON.stringify(value);return text.length<=12000?text:null}catch{return null}
}
function safeUrl(value){
  const raw=clean(value,2048);if(!raw)return '';
  try{const url=new URL(raw);return url.protocol==='https:'?url.href:''}catch{return ''}
}
function fieldPath(value){
  const field=clean(value,120);
  return /^[A-Za-z0-9][A-Za-z0-9_.-]{0,119}$/.test(field)?field:'';
}
function confidenceValue(value){
  if(value===null||value===undefined||value==='')return null;
  const number=Number(value);return Number.isFinite(number)?Math.max(0,Math.min(1,number)):null;
}
function evidenceScore(row){
  return (REVIEW_RANK[row.review_state]??0)+(SOURCE_RANK[row.source_class]??0)+(confidenceValue(row.confidence)??0);
}
function normalizeEvidenceRow(row){
  return {
    evidenceKey:String(row.evidence_key||''),
    fieldPath:String(row.field_path||''),
    value:safeParse(row.value_json,null),
    sourceClass:String(row.source_class||'needs_check'),
    sourceLabel:PROFILE_SOURCE_LABELS[row.source_class]||PROFILE_SOURCE_LABELS.needs_check,
    sourceName:String(row.source_name||''),
    sourceUrl:String(row.source_url||''),
    sourceRecordId:String(row.source_record_id||''),
    observedAt:row.observed_at||null,
    confidence:confidenceValue(row.confidence),
    reviewState:String(row.review_state||'unreviewed'),
    isCurrent:Number(row.is_current)===1,
  };
}
function distinctValueKey(row){return String(row.value_json??'null')}

export function buildCanonicalProfile(rows=[]){
  const current=rows.filter(row=>Number(row.is_current)!==0&&String(row.review_state||'unreviewed')!=='rejected');
  const groups=new Map();
  for(const row of current){
    const field=String(row.field_path||'');if(!field)continue;
    if(!groups.has(field))groups.set(field,[]);
    groups.get(field).push(row);
  }
  const fields=[];const sourceCounts=Object.fromEntries(PROFILE_SOURCE_CLASSES.map(source=>[source,0]));
  for(const row of current)if(sourceCounts[row.source_class]!==undefined)sourceCounts[row.source_class]+=1;
  for(const [field,candidates] of [...groups.entries()].sort(([a],[b])=>a.localeCompare(b))){
    const sorted=[...candidates].sort((a,b)=>evidenceScore(b)-evidenceScore(a)||Number(b.id||0)-Number(a.id||0));
    const selected=sorted[0];
    const grounded=sorted.filter(row=>STRONG_SOURCES.has(row.source_class));
    const conflict=new Set(grounded.map(distinctValueKey)).size>1;
    const humanConfirmed=['confirmed','corrected'].includes(String(selected.review_state||''));
    const weakSource=!STRONG_SOURCES.has(selected.source_class)&&selected.source_class!=='user';
    const needsReview=!humanConfirmed&&(conflict||weakSource||selected.source_class==='user');
    fields.push({
      fieldPath:field,
      ...normalizeEvidenceRow(selected),
      conflict,
      humanConfirmed,
      needsReview,
      alternatives:sorted.slice(1,6).map(normalizeEvidenceRow),
    });
  }
  const strongFields=fields.filter(item=>STRONG_SOURCES.has(item.sourceClass)).length;
  const officialFields=fields.filter(item=>item.sourceClass==='official').length;
  const humanConfirmedFields=fields.filter(item=>item.humanConfirmed).length;
  const needsReviewFields=fields.filter(item=>item.needsReview).length;
  const conflictFields=fields.filter(item=>item.conflict).length;
  const nextQuestions=fields.filter(item=>item.needsReview).map(item=>({
    fieldPath:item.fieldPath,
    reason:item.conflict?'conflicting_evidence':item.sourceClass==='user'?'user_value_unconfirmed':'official_evidence_missing',
    message:item.conflict?'근거 자료가 서로 달라 최종 확인이 필요합니다.':item.sourceClass==='user'?'사용자 제공값을 최종 확인해 주세요.':'공식 또는 검증 가능한 근거가 부족합니다. 자료를 추가하거나 값을 확인해 주세요.',
  }));
  if(fields.length===0)nextQuestions.push({fieldPath:'*',reason:'no_evidence',message:'아직 근거 자료가 없습니다. 공식자료 선조회를 실행하거나 확인 가능한 자료를 추가해 주세요.'});
  return {
    fields,
    sourceCounts,
    readiness:{
      totalFields:fields.length,
      evidenceCount:current.length,
      officialFields,
      strongFields,
      humanConfirmedFields,
      needsReviewFields,
      conflictFields,
      officialFirstCoverage:fields.length?Number((strongFields/fields.length).toFixed(3)):0,
      canFinalize:fields.length>0&&needsReviewFields===0,
    },
    nextQuestions,
  };
}

function cors(request,env){
  const origin=String(request.headers.get('origin')||'');
  const allowedOrigins=String(env.ALLOWED_ORIGINS||'').split(',').map(value=>value.trim()).filter(Boolean);
  const allowed=!origin||allowedOrigins.includes(origin);
  const headers={
    'access-control-allow-headers':'content-type, authorization, idempotency-key',
    'access-control-allow-methods':'GET, POST, OPTIONS',
    'access-control-max-age':'86400',
    vary:'Origin',
  };
  if(origin&&allowed)headers['access-control-allow-origin']=origin;
  return {allowed,headers};
}
function responseJson(request,env,data,status=200){
  const {headers}=cors(request,env);
  return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer',...headers}});
}
async function requestBody(request){try{return await request.json()}catch{return null}}

export async function profileSchemaReady(env){ return d1SchemaReady(env?.DB,['ekodi_profiles','ekodi_profile_evidence','ekodi_profile_confirmations','ekodi_profile_discovery_runs']); }

async function profileForSubject(env,profileKey,subject){
  return env.DB.prepare(`SELECT profile_key,subject_type,subject_key,entity_type,display_name,public_identifier,status,review_state,created_at,updated_at,confirmed_at FROM ekodi_profiles WHERE profile_key=? AND subject_type=? AND subject_key=? AND status='active'`)
    .bind(profileKey,subject.type,subject.key).first();
}
async function evidenceRows(env,profileKey){
  const result=await env.DB.prepare(`SELECT id,evidence_key,field_path,value_json,source_class,source_name,source_url,source_record_id,observed_at,confidence,review_state,is_current,created_at,updated_at FROM ekodi_profile_evidence WHERE profile_key=? AND is_current=1 ORDER BY field_path ASC,id DESC`).bind(profileKey).all();
  return result.results||[];
}
async function refreshReviewState(env,profileKey){
  const rows=await evidenceRows(env,profileKey);const canonical=buildCanonicalProfile(rows);
  const confirmed=canonical.readiness.humanConfirmedFields;
  const state=confirmed>0?'partially_confirmed':'needs_review';
  await env.DB.prepare(`UPDATE ekodi_profiles SET review_state=?,confirmed_at=NULL,updated_at=? WHERE profile_key=?`).bind(state,nowIso(),profileKey).run();
  return canonical;
}
async function profileBundle(env,profile){
  const [evidence,confirmations,discoveries]=await Promise.all([
    evidenceRows(env,profile.profile_key),
    env.DB.prepare(`SELECT confirmation_key,field_path,action,note,created_at FROM ekodi_profile_confirmations WHERE profile_key=? ORDER BY id DESC LIMIT 100`).bind(profile.profile_key).all(),
    env.DB.prepare(`SELECT run_key,provider_id,status,evidence_count,note,started_at,completed_at FROM ekodi_profile_discovery_runs WHERE profile_key=? ORDER BY id DESC LIMIT 20`).bind(profile.profile_key).all(),
  ]);
  const canonical=buildCanonicalProfile(evidence);
  return {
    profile:{profileKey:profile.profile_key,entityType:profile.entity_type,displayName:profile.display_name,publicIdentifier:profile.public_identifier||'',status:profile.status,reviewState:profile.review_state,createdAt:profile.created_at,updatedAt:profile.updated_at,confirmedAt:profile.confirmed_at||null},
    ...canonical,
    confirmations:confirmations.results||[],
    discoveries:discoveries.results||[],
    policy:{officialDataFirst:true,humanConfirmationLast:true,unknownFactsMustStayUnknown:true,personalDiscoveryRequiresConsent:true,aiInferenceIsNeverPresentedAsFact:true},
  };
}

async function listProfiles(request,env,ctx){
  const result=await env.DB.prepare(`SELECT profile_key,entity_type,display_name,public_identifier,review_state,created_at,updated_at,confirmed_at FROM ekodi_profiles WHERE subject_type=? AND subject_key=? AND status='active' ORDER BY updated_at DESC LIMIT 100`).bind(ctx.subject.type,ctx.subject.key).all();
  return responseJson(request,env,{subject:ctx.subject,profiles:(result.results||[]).map(row=>({profileKey:row.profile_key,entityType:row.entity_type,displayName:row.display_name,publicIdentifier:row.public_identifier||'',reviewState:row.review_state,createdAt:row.created_at,updatedAt:row.updated_at,confirmedAt:row.confirmed_at||null}))});
}
async function createProfile(request,env,ctx){
  const data=await requestBody(request);if(!data)return responseJson(request,env,{error:'INVALID_JSON'},400);
  const entityType=clean(data.entityType,40).toLowerCase();const displayName=clean(data.displayName,180);const publicIdentifier=clean(data.publicIdentifier,120);
  if(!ENTITY_TYPES.has(entityType))return responseJson(request,env,{error:'ENTITY_TYPE_REQUIRED',allowed:PROFILE_ENTITY_TYPES},400);
  if(!displayName)return responseJson(request,env,{error:'DISPLAY_NAME_REQUIRED'},400);
  if(entityType==='person'&&publicIdentifier)return responseJson(request,env,{error:'PERSON_PUBLIC_IDENTIFIER_NOT_ALLOWED'},400);
  const profileKey=newKey('profile');const now=nowIso();
  await env.DB.prepare(`INSERT INTO ekodi_profiles(profile_key,subject_type,subject_key,entity_type,display_name,public_identifier,status,review_state,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(profileKey,ctx.subject.type,ctx.subject.key,entityType,displayName,publicIdentifier,'active','needs_review',ctx.principal.id,now,now).run();
  await auditPrincipal(env,ctx.principal,'profile:write');
  return responseJson(request,env,{ok:true,profileKey,next:'discover_official_data',policy:{officialDataFirst:true,personalDiscoveryRequiresConsent:true}},201);
}
async function readProfile(request,env,ctx,profileKey){
  const profile=await profileForSubject(env,profileKey,ctx.subject);if(!profile)return responseJson(request,env,{error:'NOT_FOUND'},404);
  await auditPrincipal(env,ctx.principal,'profile:read');
  return responseJson(request,env,{subject:ctx.subject,...await profileBundle(env,profile)});
}

async function insertEvidence(env,profileKey,item,actor,{forcedSourceClass='',forcedReviewState=''}={}){
  const field=fieldPath(item.fieldPath);const valueJson=jsonValue(item.value);
  if(!field||valueJson===null)return {error:'INVALID_EVIDENCE'};
  const sourceClass=forcedSourceClass||clean(item.sourceClass,40).toLowerCase();
  if(!SOURCE_CLASSES.has(sourceClass))return {error:'INVALID_SOURCE_CLASS'};
  const sourceName=clean(item.sourceName,240);const sourceUrl=safeUrl(item.sourceUrl);
  if(item.sourceUrl&&!sourceUrl)return {error:'HTTPS_SOURCE_URL_REQUIRED'};
  const sourceRecordId=clean(item.sourceRecordId,240);const observedAt=clean(item.observedAt,64)||null;const confidence=confidenceValue(item.confidence);
  const reviewState=forcedReviewState||'unreviewed';
  const existing=await env.DB.prepare(`SELECT evidence_key FROM ekodi_profile_evidence WHERE profile_key=? AND field_path=? AND value_json=? AND source_class=? AND source_name=? AND source_record_id=? AND is_current=1 LIMIT 1`)
    .bind(profileKey,field,valueJson,sourceClass,sourceName,sourceRecordId).first();
  if(existing)return {evidenceKey:existing.evidence_key,inserted:false};
  if(sourceName){
    await env.DB.prepare(`UPDATE ekodi_profile_evidence SET is_current=0,updated_at=? WHERE profile_key=? AND field_path=? AND source_class=? AND source_name=? AND is_current=1`).bind(nowIso(),profileKey,field,sourceClass,sourceName).run();
  }
  const evidenceKey=newKey('evidence');const now=nowIso();
  await env.DB.prepare(`INSERT INTO ekodi_profile_evidence(evidence_key,profile_key,field_path,value_json,source_class,source_name,source_url,source_record_id,observed_at,confidence,review_state,is_current,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(evidenceKey,profileKey,field,valueJson,sourceClass,sourceName,sourceUrl,sourceRecordId,observedAt,confidence,reviewState,1,actor,now,now).run();
  return {evidenceKey,inserted:true};
}
async function addUserEvidence(request,env,ctx,profileKey){
  const profile=await profileForSubject(env,profileKey,ctx.subject);if(!profile)return responseJson(request,env,{error:'NOT_FOUND'},404);
  const data=await requestBody(request);if(!data)return responseJson(request,env,{error:'INVALID_JSON'},400);
  const result=await insertEvidence(env,profileKey,{...data,sourceName:'EKODI User'},ctx.principal.id,{forcedSourceClass:'user'});
  if(result.error)return responseJson(request,env,{error:result.error},400);
  const canonical=await refreshReviewState(env,profileKey);await auditPrincipal(env,ctx.principal,'profile:evidence-write');
  return responseJson(request,env,{ok:true,...result,readiness:canonical.readiness,nextQuestions:canonical.nextQuestions},result.inserted?201:200);
}

function discoveryProviders(env,payload){
  const providers=[];
  if(env.PROFILE_DATA&&typeof env.PROFILE_DATA.fetch==='function')providers.push({id:'profile_data_binding',invoke:async()=>{
    const response=await env.PROFILE_DATA.fetch('https://ekodi.internal/profile/discover',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
    if(!response.ok)throw new Error('PROFILE_DATA_BINDING_FAILED');return response.json();
  }});
  const endpoint=safeUrl(env.PROFILE_DATA_URL||'');
  if(endpoint)providers.push({id:'profile_data_http',invoke:async()=>{
    const response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json',...(env.PROFILE_DATA_TOKEN?{authorization:`Bearer ${env.PROFILE_DATA_TOKEN}`}:{})},body:JSON.stringify(payload),signal:AbortSignal.timeout(6000)});
    if(!response.ok)throw new Error('PROFILE_DATA_HTTP_FAILED');return response.json();
  }});
  return providers;
}
async function discoverOfficialData(request,env,ctx,profileKey){
  const profile=await profileForSubject(env,profileKey,ctx.subject);if(!profile)return responseJson(request,env,{error:'NOT_FOUND'},404);
  const data=await requestBody(request)||{};
  if(profile.entity_type==='person'&&data.consent!==true)return responseJson(request,env,{error:'PERSON_DISCOVERY_CONSENT_REQUIRED'},409);
  const payload={profileKey,entityType:profile.entity_type,displayName:profile.display_name,publicIdentifier:profile.entity_type==='person'?'':profile.public_identifier||'',policy:{allowedSourceClasses:[...DISCOVERY_SOURCES],personalConsent:profile.entity_type==='person'?true:null,doNotInferMissingFacts:true}};
  const providers=discoveryProviders(env,payload);
  const runKey=newKey('discovery');const started=nowIso();
  if(providers.length===0){
    await env.DB.prepare(`INSERT INTO ekodi_profile_discovery_runs(run_key,profile_key,provider_id,status,evidence_count,note,started_at,completed_at) VALUES(?,?,?,?,?,?,?,?)`).bind(runKey,profileKey,'','degraded',0,'Official data provider is not configured.',started,nowIso()).run();
    return responseJson(request,env,{error:'OFFICIAL_DATA_PROVIDER_UNAVAILABLE',profileKey,runKey,manualEvidenceStillAvailable:true},503);
  }
  let providerId='';let providerData=null;let lastError='';
  for(const provider of providers){
    try{providerData=await provider.invoke();providerId=provider.id;break}catch(error){lastError=clean(error?.message||error,500)}
  }
  if(!providerData){
    await env.DB.prepare(`INSERT INTO ekodi_profile_discovery_runs(run_key,profile_key,provider_id,status,evidence_count,note,started_at,completed_at) VALUES(?,?,?,?,?,?,?,?)`).bind(runKey,profileKey,providerId,'failed',0,lastError||'Official data discovery failed.',started,nowIso()).run();
    return responseJson(request,env,{error:'OFFICIAL_DATA_DISCOVERY_FAILED',runKey},502);
  }
  const items=Array.isArray(providerData.evidence)?providerData.evidence.slice(0,200):[];let inserted=0;const rejected=[];
  for(const item of items){
    const sourceClass=clean(item?.sourceClass,40).toLowerCase();
    if(!DISCOVERY_SOURCES.has(sourceClass)){rejected.push({fieldPath:clean(item?.fieldPath,120),reason:'UNTRUSTED_DISCOVERY_SOURCE_CLASS'});continue}
    const result=await insertEvidence(env,profileKey,item,`provider:${providerId}`);
    if(result.inserted)inserted+=1;else if(result.error)rejected.push({fieldPath:clean(item?.fieldPath,120),reason:result.error});
  }
  const canonical=await refreshReviewState(env,profileKey);const completed=nowIso();
  await env.DB.prepare(`INSERT INTO ekodi_profile_discovery_runs(run_key,profile_key,provider_id,status,evidence_count,note,started_at,completed_at) VALUES(?,?,?,?,?,?,?,?)`).bind(runKey,profileKey,providerId,'complete',inserted,rejected.length?`${rejected.length} evidence item(s) rejected by policy.`:'',started,completed).run();
  await auditPrincipal(env,ctx.principal,'profile:discover');
  return responseJson(request,env,{ok:true,profileKey,runKey,provider:providerId,inserted,rejected,readiness:canonical.readiness,nextQuestions:canonical.nextQuestions});
}

async function confirmField(request,env,ctx,profileKey){
  const profile=await profileForSubject(env,profileKey,ctx.subject);if(!profile)return responseJson(request,env,{error:'NOT_FOUND'},404);
  const data=await requestBody(request);if(!data)return responseJson(request,env,{error:'INVALID_JSON'},400);
  const field=fieldPath(data.fieldPath);const action=clean(data.action,20).toLowerCase();
  if(!field||!CONFIRM_ACTIONS.has(action))return responseJson(request,env,{error:'INVALID_CONFIRMATION'},400);
  const rows=await evidenceRows(env,profileKey);const canonical=buildCanonicalProfile(rows);const selected=canonical.fields.find(item=>item.fieldPath===field);
  if(action!=='correct'&&!selected)return responseJson(request,env,{error:'FIELD_EVIDENCE_NOT_FOUND'},404);
  const now=nowIso();let valueJson=null;
  if(action==='correct'){
    valueJson=jsonValue(data.value);if(valueJson===null)return responseJson(request,env,{error:'CORRECTION_VALUE_REQUIRED'},400);
    const inserted=await insertEvidence(env,profileKey,{fieldPath:field,value:data.value,sourceName:'EKODI User Correction'},ctx.principal.id,{forcedSourceClass:'user',forcedReviewState:'corrected'});
    if(inserted.error)return responseJson(request,env,{error:inserted.error},400);
  }else{
    valueJson=jsonValue(selected.value);
    await env.DB.prepare(`UPDATE ekodi_profile_evidence SET review_state=?,updated_at=? WHERE evidence_key=? AND profile_key=?`).bind(action==='confirm'?'confirmed':'rejected',now,selected.evidenceKey,profileKey).run();
  }
  await env.DB.prepare(`INSERT INTO ekodi_profile_confirmations(confirmation_key,profile_key,field_path,action,value_json,note,confirmed_by,created_at) VALUES(?,?,?,?,?,?,?,?)`)
    .bind(newKey('confirm'),profileKey,field,action,valueJson,clean(data.note,1000),ctx.principal.id,now).run();
  const updated=await refreshReviewState(env,profileKey);await auditPrincipal(env,ctx.principal,'profile:confirm');
  return responseJson(request,env,{ok:true,fieldPath:field,action,readiness:updated.readiness,nextQuestions:updated.nextQuestions});
}
async function finalizeProfile(request,env,ctx,profileKey){
  const profile=await profileForSubject(env,profileKey,ctx.subject);if(!profile)return responseJson(request,env,{error:'NOT_FOUND'},404);
  const canonical=buildCanonicalProfile(await evidenceRows(env,profileKey));
  if(!canonical.readiness.canFinalize)return responseJson(request,env,{error:'PROFILE_REVIEW_REQUIRED',readiness:canonical.readiness,nextQuestions:canonical.nextQuestions},409);
  const now=nowIso();
  await env.DB.batch([
    env.DB.prepare(`UPDATE ekodi_profiles SET review_state='confirmed',confirmed_at=?,updated_at=? WHERE profile_key=?`).bind(now,now,profileKey),
    env.DB.prepare(`INSERT INTO ekodi_profile_confirmations(confirmation_key,profile_key,field_path,action,value_json,note,confirmed_by,created_at) VALUES(?,?,?,?,?,?,?,?)`).bind(newKey('confirm'),profileKey,'*','confirm',null,'Profile final sign-off',ctx.principal.id,now),
  ]);
  await auditPrincipal(env,ctx.principal,'profile:finalize');
  return responseJson(request,env,{ok:true,profileKey,reviewState:'confirmed',confirmedAt:now,readiness:canonical.readiness});
}

function profileAiProviders(env,payload){
  const providers=[];
  if(env.PROFILE_AI&&typeof env.PROFILE_AI.fetch==='function')providers.push({id:'profile_ai_binding',invoke:async()=>{
    const response=await env.PROFILE_AI.fetch('https://ekodi.internal/profile/analyze',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
    if(!response.ok)throw new Error('PROFILE_AI_BINDING_FAILED');return response.json();
  }});
  const endpoint=safeUrl(env.PROFILE_AI_URL||'');
  if(endpoint)providers.push({id:'profile_ai_http',invoke:async()=>{
    const response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json',...(env.PROFILE_AI_TOKEN?{authorization:`Bearer ${env.PROFILE_AI_TOKEN}`}:{})},body:JSON.stringify(payload),signal:AbortSignal.timeout(4500)});
    if(!response.ok)throw new Error('PROFILE_AI_HTTP_FAILED');return response.json();
  }});
  return providers;
}
async function analyzeProfile(request,env,ctx,profileKey){
  const profile=await profileForSubject(env,profileKey,ctx.subject);if(!profile)return responseJson(request,env,{error:'NOT_FOUND'},404);
  const bundle=await profileBundle(env,profile);
  const facts=bundle.fields.map(item=>({fieldPath:item.fieldPath,value:item.value,sourceClass:item.sourceClass,sourceName:item.sourceName,confidence:item.confidence,conflict:item.conflict}));
  const payload={profile:{entityType:profile.entity_type,displayName:profile.display_name},facts,readiness:bundle.readiness,policy:{factsOnly:true,doNotInventMissingFacts:true,allGeneratedConclusionsAreAiInference:true}};
  const fallback=async()=>({
    summary:`${profile.display_name} 프로필은 ${bundle.readiness.totalFields}개 필드 중 ${bundle.readiness.strongFields}개가 공식·검증·공개 근거로 구성되어 있습니다.`,
    risks:bundle.nextQuestions.map(item=>item.message),
    opportunities:[],
    missingInfo:bundle.nextQuestions.map(item=>item.fieldPath),
  });
  const result=await runAiEnhancedTask({env,providers:profileAiProviders(env,payload),taskName:'profile_analysis',timeoutMs:4000,fallback});
  await auditPrincipal(env,ctx.principal,'profile:analyze');
  return responseJson(request,env,{profileKey,sourceClass:'ai_inference',sourceLabel:PROFILE_SOURCE_LABELS.ai_inference,mode:result.mode,degraded:Boolean(result.degraded),provider:result.provider||null,notice:result.notice||'',analysis:result.value||await fallback(),facts,readiness:bundle.readiness,nextQuestions:bundle.nextQuestions,policy:{analysisNeverOverridesEvidence:true}});
}

export async function handleProfileEvidenceApi(request,env){
  const url=new URL(request.url);const path=url.pathname.replace(/\/+$/,'')||'/';
  if(path!=='/v1/profiles'&&!path.startsWith('/v1/profiles/'))return null;
  const {allowed,headers}=cors(request,env);
  if(request.method==='OPTIONS')return new Response(null,{status:allowed?204:403,headers});
  if(!allowed)return responseJson(request,env,{error:'ORIGIN_FORBIDDEN'},403);
  if(!env?.DB)return responseJson(request,env,{error:'DATABASE_UNAVAILABLE'},503);
  const write=['POST','PUT','PATCH','DELETE'].includes(request.method)&&!path.endsWith('/analysis');
  const ctx=await resolveWorkspacePrincipal(request,env,{write});if(ctx.error)return responseJson(request,env,{error:ctx.error},ctx.status);
  if(request.method==='GET'&&path==='/v1/profiles')return listProfiles(request,env,ctx);
  if(request.method==='POST'&&path==='/v1/profiles')return createProfile(request,env,ctx);
  let match=path.match(/^\/v1\/profiles\/([A-Za-z0-9_]+)$/);
  if(match&&request.method==='GET')return readProfile(request,env,ctx,match[1]);
  match=path.match(/^\/v1\/profiles\/([A-Za-z0-9_]+)\/evidence$/);
  if(match&&request.method==='POST')return addUserEvidence(request,env,ctx,match[1]);
  match=path.match(/^\/v1\/profiles\/([A-Za-z0-9_]+)\/discover$/);
  if(match&&request.method==='POST')return discoverOfficialData(request,env,ctx,match[1]);
  match=path.match(/^\/v1\/profiles\/([A-Za-z0-9_]+)\/confirm$/);
  if(match&&request.method==='POST')return confirmField(request,env,ctx,match[1]);
  match=path.match(/^\/v1\/profiles\/([A-Za-z0-9_]+)\/finalize$/);
  if(match&&request.method==='POST')return finalizeProfile(request,env,ctx,match[1]);
  match=path.match(/^\/v1\/profiles\/([A-Za-z0-9_]+)\/analysis$/);
  if(match&&request.method==='POST')return analyzeProfile(request,env,ctx,match[1]);
  return responseJson(request,env,{error:'NOT_FOUND'},404);
}
