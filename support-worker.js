import { injectEkodiShell } from './ekodi-shell-injector.js';
import { SUPPORT_STAGES, OPPORTUNITY_SERVICES, analyzeGuidanceChange, scoreOpportunity, fillOfficialForm, buildNextActions, requiresHumanGate, rankOpportunities, buildProactiveBrief } from './support/core.js';
import { officialSourceStatus, fetchBizinfoNotices } from './support/sources.js';

const SPECIALIST_PATHS=new Set(OPPORTUNITY_SERVICES.map(service=>service.path));
function centralIdentityConfig(env={}){
  const dataMode=env.DATA_MODE||'isolated-staging';
  const production=dataMode==='production';
  const supabaseUrl=production?String(env.SUPABASE_URL||''):'';
  const publishableKey=production?String(env.SUPABASE_PUBLISHABLE_KEY||''):'';
  const enabled=Boolean(production&&supabaseUrl&&publishableKey);
  return {
    enabled,
    modeLabel:production?'EKODI 계정':'격리 스테이징',
    disabledReason:production?'중앙 계정 설정이 준비되지 않았습니다.':'격리 스테이징에서는 실제 EKODI 개인 데이터를 읽지 않습니다.',
    authUrl:env.AUTH_URL||'https://auth.ekodi.kr/?site=support',
    supabaseUrl:enabled?supabaseUrl:'',
    publishableKey:enabled?publishableKey:'',
    profileApi:enabled?`${supabaseUrl.replace(/\/$/,'')}/functions/v1/profile-api`:'',
    sharedFields:['display_name','account_status'],
    supportProfileStorage:'browser-local',
  };
}
function securityHeaders(env={}){
  const identity=centralIdentityConfig(env);
  const scriptSrc=["'self'"];
  const connectSrc=["'self'"];
  if(identity.enabled){
    scriptSrc.push('https://cdn.jsdelivr.net','https://esm.sh');
    try{connectSrc.push(new URL(identity.supabaseUrl).origin)}catch{}
  }
  return {
    'x-content-type-options':'nosniff',
    'referrer-policy':'strict-origin-when-cross-origin',
    'permissions-policy':'camera=(), microphone=(), geolocation=()',
    'content-security-policy':`default-src 'self'; script-src ${scriptSrc.join(' ')}; style-src 'self'; img-src 'self' data: https:; connect-src ${connectSrc.join(' ')}; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; upgrade-insecure-requests`,
  };
}
function json(data,status=200,env={}){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...securityHeaders(env)}})}
function withHeaders(response,env={}){const headers=new Headers(response.headers);for(const[key,value]of Object.entries(securityHeaders(env)))headers.set(key,value);if(!headers.has('cache-control'))headers.set('cache-control',response.headers.get('content-type')?.includes('text/html')?'no-cache':'public, max-age=300');return new Response(response.body,{status:response.status,statusText:response.statusText,headers})}
async function body(request){try{return await request.json()}catch{return null}}
function runtimeConfig(env){const sources=officialSourceStatus(env);return{dataMode:env.DATA_MODE||'isolated-staging',authUrl:env.AUTH_URL||'https://auth.ekodi.kr/?site=support',centralIdentity:centralIdentityConfig(env),officialSourceRequired:true,officialSources:sources.map(({id,name,mode})=>({id,name,mode})),specialistServices:OPPORTUNITY_SERVICES.map(({id,path,label,sourceStatus})=>({id,path,label,sourceStatus})),submissionExecution:false,humanGateRequired:true,persistence:'browser-local-first',proactiveBriefing:true,sharedOpportunityCore:true,specialistWorkspace:true}}
async function getOfficialNotices(env,url){const source=url.searchParams.get('source')||'bizinfo';if(source!=='bizinfo')return{ok:false,source,reason:'source_not_enabled',items:[]};return fetchBizinfoNotices(env,{limit:url.searchParams.get('limit')||100,category:url.searchParams.get('category')||'',hashtags:url.searchParams.get('hashtags')||''})}
async function serveOpportunityApp(request,env,assetPath='/index.html'){const assetUrl=new URL(assetPath,request.url);const response=await env.ASSETS.fetch(new Request(assetUrl,{method:'GET',headers:request.headers}));return injectEkodiShell(withHeaders(response,env),'support')}

export default{async fetch(request,env){
  const url=new URL(request.url);
  if(url.pathname==='/health')return json({ok:true,service:'ekodi-support-opportunity',surface:'support-platform',stages:SUPPORT_STAGES,specialistServices:OPPORTUNITY_SERVICES.map(({id,path,label})=>({id,path,label})),sharedOpportunityCore:true,specialistWorkspace:true,officialSourceRequired:true,officialSources:officialSourceStatus(env).map(({id,mode})=>({id,mode})),submissionExecution:false,humanGateRequired:true,centralIdentityEnabled:centralIdentityConfig(env).enabled,dataMode:runtimeConfig(env).dataMode,ekodiShell:true},200,env);
  if(url.pathname==='/config.js')return new Response(`window.EKODI_SUPPORT_CONFIG=${JSON.stringify(runtimeConfig(env))};`,{headers:{'content-type':'application/javascript; charset=utf-8','cache-control':'no-store',...securityHeaders(env)}});
  if(url.pathname==='/api/services'&&request.method==='GET')return json({services:OPPORTUNITY_SERVICES,sharedOpportunityCore:true,specialistWorkspace:true},200,env);
  if(url.pathname==='/api/sources/status'&&request.method==='GET')return json({sources:officialSourceStatus(env)},200,env);
  if(url.pathname==='/api/opportunities'&&request.method==='GET'){const result=await getOfficialNotices(env,url);return json(result,result.ok?200:result.reason==='credential_required'?503:502,env)}
  if(url.pathname==='/api/opportunities/match'&&request.method==='POST'){const p=await body(request);if(!p?.profile)return json({error:'profile_required'},400,env);let notices=p.notices;if(!Array.isArray(notices)){const upstream=await fetchBizinfoNotices(env,{limit:p.limit||100,category:p.category||'',hashtags:p.hashtags||''});if(!upstream.ok)return json(upstream,upstream.reason==='credential_required'?503:502,env);notices=upstream.items}return json({matches:rankOpportunities(p.profile,notices,{minScore:p.minScore,now:p.now,serviceId:p.serviceId}),source:Array.isArray(p.notices)?'provided':'bizinfo',serviceId:p.serviceId||'all'},200,env)}
  if(url.pathname==='/api/proactive-brief'&&request.method==='POST'){const p=await body(request);if(!p?.profile)return json({error:'profile_required'},400,env);let notices=Array.isArray(p.notices)?p.notices:null;if(!notices){const upstream=await fetchBizinfoNotices(env,{limit:p.limit||100,category:p.category||'',hashtags:p.hashtags||''});if(!upstream.ok)return json({...upstream,brief:buildProactiveBrief(p.profile,[],p.projects||[],{minScore:p.minScore,now:p.now,serviceId:p.serviceId})},upstream.reason==='credential_required'?503:502,env);notices=upstream.items}return json(buildProactiveBrief(p.profile,notices,p.projects||[],{minScore:p.minScore,now:p.now,serviceId:p.serviceId}),200,env)}
  if(url.pathname==='/api/change-analysis'&&request.method==='POST'){const p=await body(request);if(!p)return json({error:'invalid_json'},400,env);return json(analyzeGuidanceChange(p.previous,p.current),200,env)}
  if(url.pathname==='/api/opportunity-score'&&request.method==='POST'){const p=await body(request);if(!p)return json({error:'invalid_json'},400,env);return json({score:scoreOpportunity(p.profile,p.notice)},200,env)}
  if(url.pathname==='/api/form-fill'&&request.method==='POST'){const p=await body(request);if(!p||!Array.isArray(p.schema))return json({error:'invalid_form_schema'},400,env);return json({fields:fillOfficialForm(p.schema,p.profile,p.project)},200,env)}
  if(url.pathname==='/api/next-actions'&&request.method==='POST'){const p=await body(request);return json({actions:buildNextActions(p||{})},200,env)}
  if(url.pathname==='/api/action-gate'&&request.method==='POST'){const p=await body(request);const action=p?.action||'';return json({action,humanGateRequired:requiresHumanGate(action),allowedAutonomously:!requiresHumanGate(action)},200,env)}
  if(url.pathname==='/admin'||url.pathname==='/admin/')return Response.redirect('https://admin.ekodi.kr/',307);
  if(request.method==='GET'&&SPECIALIST_PATHS.has(url.pathname.replace(/\/$/,'')))return serveOpportunityApp(request,env,'/service.html');
  const response=await env.ASSETS.fetch(request);return injectEkodiShell(withHeaders(response,env),'support');
}};
