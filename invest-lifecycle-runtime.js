import { resolveWorkspacePrincipal, auditPrincipal } from './ekodi-principal.js';

const PROJECT_TYPES=new Set(['business','startup','small_business','local','impact','real_estate','project','other']);
const REVIEW_STATES=new Set(['draft','review_ready','reviewed']);
const COUNTERPARTY_TYPES=new Set(['person','organization','institution','licensed_provider','other']);
const INTEREST_SOURCES=new Set(['owner_recorded','external_inquiry','partner_referral']);
const INTEREST_LEVELS=new Set(['watch','request_info','meeting','diligence','declined']);
const CONNECTION_STATES=new Set(['candidate','contacted','meeting','nda','diligence','connected','closed']);
const AFTERCARE_CATEGORIES=new Set(['milestone','metric','risk','governance','report']);
const AFTERCARE_STATES=new Set(['on_track','watch','attention','closed']);

const clean=(value,max=4000)=>String(value??'').trim().slice(0,max);
const nowIso=()=>new Date().toISOString();
const toId=value=>{const n=Number(value);return Number.isInteger(n)&&n>0?n:0};
const amount=value=>{const n=Number(value??0);return Number.isFinite(n)&&n>=0?Math.floor(n):null};
const safeJson=value=>{try{return JSON.stringify(value??null)}catch{return 'null'}};
const safeParse=(value,fallback)=>{try{return JSON.parse(String(value||''))}catch{return fallback}};
function safeUrl(value){const raw=clean(value,1200);if(!raw)return'';try{const url=new URL(raw);return url.protocol==='https:'?url.toString():''}catch{return''}}
function currency(value){const v=clean(value||'KRW',6).toUpperCase();return /^[A-Z0-9]{3,6}$/.test(v)?v:'KRW'}
function enumValue(value,set,fallback){const v=String(value||'');return set.has(v)?v:fallback}
function cors(request,env){const origin=String(request.headers.get('origin')||'');const allowed=String(env.ALLOWED_ORIGINS||'').split(',').map(v=>v.trim()).filter(Boolean);const ok=!origin||allowed.includes(origin);const headers={'access-control-allow-headers':'content-type, authorization','access-control-allow-methods':'GET, POST, PUT, OPTIONS','access-control-max-age':'86400',vary:'Origin'};if(origin&&ok)headers['access-control-allow-origin']=origin;return {ok,headers}}
function json(request,env,data,status=200){const {headers}=cors(request,env);return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...headers}})}
async function body(request){try{return await request.json()}catch{return null}}
async function opportunityForSubject(env,id,subject){return env.DB.prepare('SELECT id,name,stage,subject_type,subject_key FROM investment_opportunities WHERE id=? AND subject_type=? AND subject_key=?').bind(id,subject.type,subject.key).first()}
async function ownedOpportunity(request,env,ctx,id){const opportunity=await opportunityForSubject(env,id,ctx.subject);if(!opportunity)return {response:json(request,env,{error:'NOT_FOUND'},404)};return {opportunity}}
function normalizeText(value){return clean(value,180).toLowerCase().replace(/\s+/g,' ')}

export function buildConnectionFit(project={},interest={}){
  const signals=[];const conflicts=[];
  const sector=normalizeText(project.sector),preferredSector=normalizeText(interest.preferred_sector||interest.preferredSector);
  if(sector&&preferredSector){if(sector===preferredSector)signals.push('sector');else conflicts.push('sector')}
  const region=normalizeText(project.region),preferredRegion=normalizeText(interest.preferred_region||interest.preferredRegion);
  if(region&&preferredRegion){if(region===preferredRegion)signals.push('region');else conflicts.push('region')}
  const target=amount(project.funding_target??project.fundingTarget)||0,min=amount(interest.ticket_min??interest.ticketMin)||0,max=amount(interest.ticket_max??interest.ticketMax)||0;
  if(target&&(min||max)){if((!min||target>=min)&&(!max||target<=max))signals.push('ticket');else conflicts.push('ticket')}
  const known=signals.length+conflicts.length;
  const compatibility=conflicts.length?'review_needed':known>=2?'compatible':signals.length?'potential':'insufficient_data';
  return {compatibility,signals,conflicts,knownDimensions:known,investmentRecommendation:false,transactionExecution:false};
}

async function readLifecycle(request,env,ctx,id){
  const owned=await ownedOpportunity(request,env,ctx,id);if(owned.response)return owned.response;
  const [project,interests,connections,aftercare]=await Promise.all([
    env.DB.prepare('SELECT * FROM investment_project_profiles WHERE opportunity_id=?').bind(id).first(),
    env.DB.prepare('SELECT * FROM investment_interest_records WHERE opportunity_id=? ORDER BY updated_at DESC,id DESC LIMIT 100').bind(id).all(),
    env.DB.prepare('SELECT * FROM investment_connections WHERE opportunity_id=? ORDER BY updated_at DESC,id DESC LIMIT 100').bind(id).all(),
    env.DB.prepare('SELECT * FROM investment_aftercare_updates WHERE opportunity_id=? ORDER BY report_date DESC,id DESC LIMIT 200').bind(id).all()
  ]);
  const profile=project?{...project,milestones:safeParse(project.milestones_json,[])}:null;
  const rows=(interests.results||[]).map(row=>({...row,fit:buildConnectionFit(profile||{},row)}));
  return json(request,env,{subject:ctx.subject,opportunity:owned.opportunity,project:profile,interests:rows,connections:connections.results||[],aftercare:aftercare.results||[],policy:{analysisAndConnectionOnly:true,investmentRecommendation:false,transactionExecution:false,custody:false,guaranteedReturn:false,humanDecisionRequired:true}});
}

async function upsertProject(request,env,ctx,id){
  const owned=await ownedOpportunity(request,env,ctx,id);if(owned.response)return owned.response;
  const data=await body(request);if(!data)return json(request,env,{error:'INVALID_JSON'},400);
  const funding=amount(data.fundingTarget);if(funding===null)return json(request,env,{error:'INVALID_FUNDING_TARGET'},400);
  const milestones=Array.isArray(data.milestones)?data.milestones.slice(0,40).map(item=>typeof item==='string'?clean(item,500):item):[];
  const now=nowIso();
  await env.DB.prepare(`INSERT INTO investment_project_profiles(opportunity_id,project_type,organization_name,sector,region,funding_target,currency,capital_purpose,revenue_model,ir_summary,milestones_json,review_state,updated_by,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(opportunity_id) DO UPDATE SET project_type=excluded.project_type,organization_name=excluded.organization_name,sector=excluded.sector,region=excluded.region,funding_target=excluded.funding_target,currency=excluded.currency,capital_purpose=excluded.capital_purpose,revenue_model=excluded.revenue_model,ir_summary=excluded.ir_summary,milestones_json=excluded.milestones_json,review_state=excluded.review_state,updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
    .bind(id,enumValue(data.projectType,PROJECT_TYPES,'project'),clean(data.organizationName,180),clean(data.sector,120),clean(data.region,120),funding,currency(data.currency),clean(data.capitalPurpose,4000),clean(data.revenueModel,4000),clean(data.irSummary,8000),safeJson(milestones),enumValue(data.reviewState,REVIEW_STATES,'draft'),ctx.identity.email,now,now).run();
  await auditPrincipal(env,ctx.principal,'invest:lifecycle:project-upsert');
  return json(request,env,{ok:true,opportunityId:id,reviewState:enumValue(data.reviewState,REVIEW_STATES,'draft'),transactionMode:'analysis-and-connection-only'});
}

async function addInterest(request,env,ctx,id){
  const owned=await ownedOpportunity(request,env,ctx,id);if(owned.response)return owned.response;
  const data=await body(request);if(!data)return json(request,env,{error:'INVALID_JSON'},400);
  const label=clean(data.counterpartyLabel,180);if(!label)return json(request,env,{error:'COUNTERPARTY_REQUIRED'},400);
  const min=amount(data.ticketMin),max=amount(data.ticketMax);if(min===null||max===null||((min||max)&&max&&min>max))return json(request,env,{error:'INVALID_TICKET_RANGE'},400);
  const now=nowIso();
  const result=await env.DB.prepare(`INSERT INTO investment_interest_records(opportunity_id,counterparty_label,counterparty_type,source,interest_level,ticket_min,ticket_max,currency,preferred_sector,preferred_region,note,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id,label,enumValue(data.counterpartyType,COUNTERPARTY_TYPES,'other'),enumValue(data.source,INTEREST_SOURCES,'owner_recorded'),enumValue(data.interestLevel,INTEREST_LEVELS,'watch'),min,max,currency(data.currency),clean(data.preferredSector,120),clean(data.preferredRegion,120),clean(data.note,3000),ctx.identity.email,now,now).run();
  await auditPrincipal(env,ctx.principal,'invest:lifecycle:interest-add');
  return json(request,env,{ok:true,interestId:Number(result.meta?.last_row_id||0),transactionMode:'analysis-and-connection-only'},201);
}

async function updateInterest(request,env,ctx,id,interestId){
  const owned=await ownedOpportunity(request,env,ctx,id);if(owned.response)return owned.response;
  const current=await env.DB.prepare('SELECT * FROM investment_interest_records WHERE id=? AND opportunity_id=?').bind(interestId,id).first();if(!current)return json(request,env,{error:'INTEREST_NOT_FOUND'},404);
  const data=await body(request);if(!data)return json(request,env,{error:'INVALID_JSON'},400);
  const min=data.ticketMin===undefined?Number(current.ticket_min):amount(data.ticketMin),max=data.ticketMax===undefined?Number(current.ticket_max):amount(data.ticketMax);if(min===null||max===null||((min||max)&&max&&min>max))return json(request,env,{error:'INVALID_TICKET_RANGE'},400);
  await env.DB.prepare(`UPDATE investment_interest_records SET counterparty_label=?,counterparty_type=?,source=?,interest_level=?,ticket_min=?,ticket_max=?,currency=?,preferred_sector=?,preferred_region=?,note=?,updated_at=? WHERE id=? AND opportunity_id=?`)
    .bind(clean(data.counterpartyLabel??current.counterparty_label,180),enumValue(data.counterpartyType,COUNTERPARTY_TYPES,current.counterparty_type),enumValue(data.source,INTEREST_SOURCES,current.source),enumValue(data.interestLevel,INTEREST_LEVELS,current.interest_level),min,max,currency(data.currency??current.currency),clean(data.preferredSector??current.preferred_sector,120),clean(data.preferredRegion??current.preferred_region,120),clean(data.note??current.note,3000),nowIso(),interestId,id).run();
  await auditPrincipal(env,ctx.principal,'invest:lifecycle:interest-update');
  return json(request,env,{ok:true,interestId});
}

async function addConnection(request,env,ctx,id){
  const owned=await ownedOpportunity(request,env,ctx,id);if(owned.response)return owned.response;
  const data=await body(request)||{};const interestId=toId(data.interestId);
  if(interestId){const interest=await env.DB.prepare('SELECT id FROM investment_interest_records WHERE id=? AND opportunity_id=?').bind(interestId,id).first();if(!interest)return json(request,env,{error:'INTEREST_NOT_FOUND'},404)}
  const now=nowIso();const result=await env.DB.prepare('INSERT INTO investment_connections(opportunity_id,interest_id,status,next_action,note,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)')
    .bind(id,interestId||null,enumValue(data.status,CONNECTION_STATES,'candidate'),clean(data.nextAction,1000),clean(data.note,3000),ctx.identity.email,now,now).run();
  await auditPrincipal(env,ctx.principal,'invest:lifecycle:connection-add');
  return json(request,env,{ok:true,connectionId:Number(result.meta?.last_row_id||0)},201);
}

async function updateConnection(request,env,ctx,id,connectionId){
  const owned=await ownedOpportunity(request,env,ctx,id);if(owned.response)return owned.response;
  const current=await env.DB.prepare('SELECT * FROM investment_connections WHERE id=? AND opportunity_id=?').bind(connectionId,id).first();if(!current)return json(request,env,{error:'CONNECTION_NOT_FOUND'},404);
  const data=await body(request);if(!data)return json(request,env,{error:'INVALID_JSON'},400);
  await env.DB.prepare('UPDATE investment_connections SET status=?,next_action=?,note=?,updated_at=? WHERE id=? AND opportunity_id=?')
    .bind(enumValue(data.status,CONNECTION_STATES,current.status),clean(data.nextAction??current.next_action,1000),clean(data.note??current.note,3000),nowIso(),connectionId,id).run();
  await auditPrincipal(env,ctx.principal,'invest:lifecycle:connection-update');
  return json(request,env,{ok:true,connectionId,status:enumValue(data.status,CONNECTION_STATES,current.status)});
}

async function addAftercare(request,env,ctx,id){
  const owned=await ownedOpportunity(request,env,ctx,id);if(owned.response)return owned.response;
  const data=await body(request)||{};const connectionId=toId(data.connectionId);
  if(connectionId){const connection=await env.DB.prepare('SELECT id FROM investment_connections WHERE id=? AND opportunity_id=?').bind(connectionId,id).first();if(!connection)return json(request,env,{error:'CONNECTION_NOT_FOUND'},404)}
  const evidenceUrl=safeUrl(data.evidenceUrl);if(data.evidenceUrl&&!evidenceUrl)return json(request,env,{error:'HTTPS_EVIDENCE_URL_REQUIRED'},400);
  const reportDate=/^\d{4}-\d{2}-\d{2}$/.test(String(data.reportDate||''))?String(data.reportDate):nowIso().slice(0,10);const now=nowIso();
  const result=await env.DB.prepare('INSERT INTO investment_aftercare_updates(opportunity_id,connection_id,report_date,category,metric_name,metric_value,status,evidence_url,note,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(id,connectionId||null,reportDate,enumValue(data.category,AFTERCARE_CATEGORIES,'report'),clean(data.metricName,160),clean(data.metricValue,500),enumValue(data.status,AFTERCARE_STATES,'on_track'),evidenceUrl,clean(data.note,4000),ctx.identity.email,now,now).run();
  await auditPrincipal(env,ctx.principal,'invest:lifecycle:aftercare-add');
  return json(request,env,{ok:true,aftercareId:Number(result.meta?.last_row_id||0)},201);
}

async function updateAftercare(request,env,ctx,id,aftercareId){
  const owned=await ownedOpportunity(request,env,ctx,id);if(owned.response)return owned.response;
  const current=await env.DB.prepare('SELECT * FROM investment_aftercare_updates WHERE id=? AND opportunity_id=?').bind(aftercareId,id).first();if(!current)return json(request,env,{error:'AFTERCARE_NOT_FOUND'},404);
  const data=await body(request);if(!data)return json(request,env,{error:'INVALID_JSON'},400);
  const evidenceUrl=data.evidenceUrl===undefined?current.evidence_url:safeUrl(data.evidenceUrl);if(data.evidenceUrl&&!evidenceUrl)return json(request,env,{error:'HTTPS_EVIDENCE_URL_REQUIRED'},400);
  const reportDate=data.reportDate&&/^\d{4}-\d{2}-\d{2}$/.test(String(data.reportDate))?String(data.reportDate):current.report_date;
  await env.DB.prepare('UPDATE investment_aftercare_updates SET report_date=?,category=?,metric_name=?,metric_value=?,status=?,evidence_url=?,note=?,updated_at=? WHERE id=? AND opportunity_id=?')
    .bind(reportDate,enumValue(data.category,AFTERCARE_CATEGORIES,current.category),clean(data.metricName??current.metric_name,160),clean(data.metricValue??current.metric_value,500),enumValue(data.status,AFTERCARE_STATES,current.status),evidenceUrl,clean(data.note??current.note,4000),nowIso(),aftercareId,id).run();
  await auditPrincipal(env,ctx.principal,'invest:lifecycle:aftercare-update');
  return json(request,env,{ok:true,aftercareId,status:enumValue(data.status,AFTERCARE_STATES,current.status)});
}

export async function handleInvestLifecycleApi(request,env){
  const url=new URL(request.url),path=url.pathname.replace(/\/+$/,'')||'/';
  if(!path.startsWith('/v1/invest/opportunities/'))return null;
  const {ok,headers}=cors(request,env);if(request.method==='OPTIONS')return new Response(null,{status:ok?204:403,headers});if(!ok)return json(request,env,{error:'ORIGIN_FORBIDDEN'},403);
  if(!env?.DB)return json(request,env,{error:'DATABASE_UNAVAILABLE'},503);
  const relevant=/^\/v1\/invest\/opportunities\/\d+\/(?:lifecycle|project|interests|connections|aftercare)(?:\/\d+)?$/.test(path);if(!relevant)return null;
  const write=!['GET','HEAD'].includes(request.method);const ctx=await resolveWorkspacePrincipal(request,env,{write});if(ctx.error)return json(request,env,{error:ctx.error},ctx.status);
  let match=path.match(/^\/v1\/invest\/opportunities\/(\d+)\/lifecycle$/);if(match&&request.method==='GET')return readLifecycle(request,env,ctx,toId(match[1]));
  match=path.match(/^\/v1\/invest\/opportunities\/(\d+)\/project$/);if(match&&request.method==='PUT')return upsertProject(request,env,ctx,toId(match[1]));
  match=path.match(/^\/v1\/invest\/opportunities\/(\d+)\/interests$/);if(match&&request.method==='POST')return addInterest(request,env,ctx,toId(match[1]));
  match=path.match(/^\/v1\/invest\/opportunities\/(\d+)\/interests\/(\d+)$/);if(match&&request.method==='PUT')return updateInterest(request,env,ctx,toId(match[1]),toId(match[2]));
  match=path.match(/^\/v1\/invest\/opportunities\/(\d+)\/connections$/);if(match&&request.method==='POST')return addConnection(request,env,ctx,toId(match[1]));
  match=path.match(/^\/v1\/invest\/opportunities\/(\d+)\/connections\/(\d+)$/);if(match&&request.method==='PUT')return updateConnection(request,env,ctx,toId(match[1]),toId(match[2]));
  match=path.match(/^\/v1\/invest\/opportunities\/(\d+)\/aftercare$/);if(match&&request.method==='POST')return addAftercare(request,env,ctx,toId(match[1]));
  match=path.match(/^\/v1\/invest\/opportunities\/(\d+)\/aftercare\/(\d+)$/);if(match&&request.method==='PUT')return updateAftercare(request,env,ctx,toId(match[1]),toId(match[2]));
  return json(request,env,{error:'METHOD_NOT_ALLOWED'},405);
}
