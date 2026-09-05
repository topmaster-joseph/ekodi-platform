import { injectEkodiShell } from './ekodi-shell-injector.js';
import { EKODI_SERVICE_MANIFEST } from './ekodi-service-manifest.js';
import { routeIntent } from './capability-intent-runtime.js';
import capabilityRegistry from './config/capability-registry.json' with { type: 'json' };
import workspacePacks from './config/workspace-packs.json' with { type: 'json' };

const WORKSPACE_KEY_RE=/^[a-z]+:[a-zA-Z0-9:_-]+$/;
const SERVICE_ID_RE=/^[a-z][a-z0-9-]*$/;
const PRIVATE_ROUTER_TAG='<script src="/private-workspace-router.js?v=20260827-private-workspace-1"></script>';
const ACCESS_CONTEXT_TAG='<script type="module" src="/access-context.js?v=20260829-common-service-access-1"></script>';

function securityHeaders(env={}){
  const connect=["'self'",'https://cdn.jsdelivr.net','https://api.ekodi.kr','https://marketing-publish-api.ekodi.kr','https://personal-finance-api.ekodi.kr'];
  if(env.SUPABASE_URL){try{connect.push(new URL(env.SUPABASE_URL).origin)}catch{}}
  return {
    'content-security-policy':`default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self'; img-src 'self' data: https:; connect-src ${connect.join(' ')}; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://auth.ekodi.kr; object-src 'none'; upgrade-insecure-requests`,
    'referrer-policy':'no-referrer',
    'x-content-type-options':'nosniff',
    'x-frame-options':'DENY',
    'permissions-policy':'camera=(), microphone=(), geolocation=()',
    'x-ekodi-service':'my-ekodi',
  };
}
function json(env,data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...securityHeaders(env)}})}
function withHeaders(env,response){
  const headers=new Headers(response.headers);
  for(const [key,value] of Object.entries(securityHeaders(env)))headers.set(key,value);
  const contentType=response.headers.get('content-type')||'';
  if(contentType.includes('text/html')){
    headers.set('cache-control','no-store');
    headers.set('x-robots-tag','noindex, nofollow, noarchive');
  }else if(!headers.has('cache-control'))headers.set('cache-control','public, max-age=300');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
function runtimeConfig(env){const dataEnabled=env.DATA_ENABLED==='true'&&Boolean(env.SUPABASE_URL&&env.SUPABASE_PUBLISHABLE_KEY);return{dataEnabled,dataMode:env.DATA_MODE||'isolated-staging',supabaseUrl:dataEnabled?env.SUPABASE_URL:'',supabasePublishableKey:dataEnabled?env.SUPABASE_PUBLISHABLE_KEY:'',authUrl:env.AUTH_URL||'https://auth.ekodi.kr/?site=my',personalFinanceApi:'https://personal-finance-api.ekodi.kr'}}
function personalBrandUrl(){const target='https://ekodi.kr/ekodibiz/marketing-ai?mode=personal-brand&source=my';return `https://auth.ekodi.kr/?site=marketing&return_to=${encodeURIComponent(target)}`}
function visibleServices(){return EKODI_SERVICE_MANIFEST.services.filter(service=>service.id!=='my'&&service.state!=='planned').sort((a,b)=>(a.order||999)-(b.order||999));}
function myServicePreamble(){
  const services=visibleServices();
  const serviceRows=services.map(service=>[service.id,service.name,service.url]);
  const openSso=services.filter(service=>service.openSso===true).map(service=>service.id);
  const sso=services.filter(service=>service.sso===true).map(service=>service.id);
  const targetable=services.filter(service=>service.targetable===true).map(service=>service.id);
  const priority=services.map(service=>service.id);
  return `const SERVICES=${JSON.stringify(serviceRows)};\nconst OPEN_SSO_SITES=new Set(${JSON.stringify(openSso)});\nconst SSO_SITES=new Set(${JSON.stringify(sso)});\nconst TARGETABLE_WORKSPACE_SITES=new Set(${JSON.stringify(targetable)});\nconst WORKSPACE_ENTRY_PRIORITY=${JSON.stringify(priority)};\nconst EKODI_SERVICE_MANIFEST_VERSION=${JSON.stringify(EKODI_SERVICE_MANIFEST.version)};`;
}
function parsePrivateWorkspacePath(pathname){
  if(!String(pathname||'').startsWith('/w/'))return null;
  const parts=String(pathname).split('/').filter(Boolean);
  if(parts[0]!=='w'||parts.length<2||parts.length>3)return false;
  let workspaceKey='';
  let serviceId='';
  try{
    workspaceKey=decodeURIComponent(parts[1]||'');
    serviceId=parts[2]?decodeURIComponent(parts[2]):'';
  }catch{return false}
  if(workspaceKey.length>180||!WORKSPACE_KEY_RE.test(workspaceKey))return false;
  if(serviceId&&(!SERVICE_ID_RE.test(serviceId)||!visibleServices().some(service=>service.id===serviceId)))return false;
  return {workspaceKey,serviceId};
}
function loadIntentCatalog(){return {registry:capabilityRegistry,packs:workspacePacks};}
function intentShowrooms(plan){
  const ids=new Set(plan.showroomEntries||[]);
  return visibleServices().filter(service=>ids.has(service.id)).map(service=>({id:service.id,name:service.name,url:service.url}));
}
function bearer(request){const value=String(request.headers.get('authorization')||'');return value.startsWith('Bearer ')?value:''}
async function verifiedWorkspaceAuthority(request,env,workspaceKey){
  const authorization=bearer(request);
  if(!authorization)return {ok:false,status:401,error:'authentication_required'};
  const supabase=String(env.SUPABASE_URL||'').replace(/\/$/,'');
  const key=String(env.SUPABASE_PUBLISHABLE_KEY||'');
  if(!supabase||!key)return {ok:false,status:503,error:'authority_provider_unavailable'};
  const response=await fetch(`${supabase}/functions/v1/workspace-api/workspaces?site=social`,{headers:{authorization,apikey:key,'cache-control':'no-store'}});
  const body=await response.json().catch(()=>({}));
  if(response.status===401)return {ok:false,status:401,error:'authentication_required'};
  if(!response.ok)return {ok:false,status:503,error:'workspace_authority_unavailable'};
  const rows=Array.isArray(body?.workspaces)?body.workspaces:[];
  const selected=rows.find(item=>String(item?.workspace_key||'')===workspaceKey&&['active','pre_registered'].includes(String(item?.status||'')));
  if(!selected)return {ok:false,status:403,error:'workspace_access_required'};
  return {ok:true,workspace:selected};
}
function intentExecutionDecision(capability){
  const tier=String(capability?.actionTier||'human_gate');
  if(tier==='observe')return {state:'execute_now',mode:'observe'};
  if(tier==='assist')return {state:'execute_now',mode:'prepare'};
  if(tier==='execute_reversible')return {state:'adapter_required',mode:'bounded_mutation'};
  if(tier==='human_gate')return {state:'human_gate',mode:'sovereign'};
  return {state:'forbidden',mode:'none'};
}
function executeSafeCapability(capability,plan){
  const decision=intentExecutionDecision(capability);
  if(decision.state!=='execute_now')return {...decision,capabilityId:capability.id};
  if(decision.mode==='observe')return {...decision,capabilityId:capability.id,result:{status:'observed',source:'registered_context',showrooms:plan.showroomEntries||[]}};
  return {...decision,capabilityId:capability.id,result:{status:'prepared',ownerAgent:capability.ownerAgent,domain:capability.domain,next:'service_adapter_or_user_surface'}};
}
async function intentRequestBody(request){
  const length=Number(request.headers.get('content-length')||0);if(length>8192)return {error:'intent_too_large',status:413};
  let body={};try{body=await request.json()}catch{return {error:'invalid_json',status:400}}
  const text=String(body?.text||'').trim(),audience=String(body?.audience||'person').trim().toLowerCase(),workspaceKey=String(body?.workspace_key||'').trim();
  if(!text)return {error:'intent_required',status:400};if(text.length>1200)return {error:'intent_too_long',status:400};if(workspaceKey.length>180||!WORKSPACE_KEY_RE.test(workspaceKey))return {error:'valid_workspace_required',status:400};
  return {text,audience,workspaceKey};
}
async function handleIntentPreflight(request,env,{execute=false}={}){
  if(request.method!=='POST')return json(env,{ok:false,error:'method_not_allowed'},405);
  const parsed=await intentRequestBody(request);if(parsed.error)return json(env,{ok:false,error:parsed.error},parsed.status);
  const authority=await verifiedWorkspaceAuthority(request,env,parsed.workspaceKey);if(!authority.ok)return json(env,{ok:false,error:authority.error},authority.status);
  const catalog=loadIntentCatalog();
  const plan=routeIntent({text:parsed.text,audience:parsed.audience},catalog,{limit:3});
  const byId=new Map(catalog.registry.capabilities.map(item=>[item.id,item]));
  const capabilities=plan.capabilityIds.map(id=>byId.get(id)).filter(Boolean);
  const decisions=capabilities.map(item=>execute?executeSafeCapability(item,plan):{capabilityId:item.id,...intentExecutionDecision(item)});
  return json(env,{ok:true,contract:execute?'ekodi.intent-execution.v1':'ekodi.intent-preflight.v1',authority:{verified:true,workspace_key:authority.workspace.workspace_key,workspace_kind:authority.workspace.workspace_kind||'',role:authority.workspace.role||'member',status:authority.workspace.status||''},plan:{contract:plan.contract,recommendations:plan.recommendations,capabilityIds:plan.capabilityIds,showroomEntries:plan.showroomEntries},decisions,summary:{executed:execute?decisions.filter(item=>item.state==='execute_now').length:0,requiresAdapter:decisions.filter(item=>item.state==='adapter_required').length,humanGate:decisions.filter(item=>item.state==='human_gate').length,forbidden:decisions.filter(item=>item.state==='forbidden').length},executionPolicy:execute?'safe_observe_and_prepare_only':'server_authority_verified'});
}

async function handleIntentPlan(request,env){
  if(request.method!=='POST')return json(env,{ok:false,error:'method_not_allowed'},405);
  const length=Number(request.headers.get('content-length')||0);
  if(length>8192)return json(env,{ok:false,error:'intent_too_large'},413);
  let body={};
  try{body=await request.json()}catch{return json(env,{ok:false,error:'invalid_json'},400)}
  const text=String(body?.text||'').trim();
  if(!text)return json(env,{ok:false,error:'intent_required'},400);
  if(text.length>1200)return json(env,{ok:false,error:'intent_too_long'},400);
  const audience=String(body?.audience||'person').trim().toLowerCase();
  const catalog=loadIntentCatalog();
  const plan=routeIntent({text,audience},catalog,{limit:3});
  const byId=new Map(catalog.registry.capabilities.map(item=>[item.id,item]));
  const packsById=new Map(catalog.packs.packs.map(item=>[item.id,item]));
  return json(env,{
    ok:true,
    contract:plan.contract,
    schemaVersion:plan.schemaVersion,
    autonomyPolicyVersion:plan.autonomyPolicyVersion,
    authorityContext:plan.authorityContext,
    principle:plan.principle,
    recommendations:plan.recommendations.map(item=>({...item,description:packsById.get(item.id)?.description||''})),
    capabilities:plan.capabilityIds.map(id=>{const item=byId.get(id);return item?{id:item.id,name:item.name,description:item.description,domain:item.domain,ownerAgent:item.ownerAgent,actionTier:item.actionTier,maturity:item.maturity}:null}).filter(Boolean),
    steps:plan.steps,
    unresolvedCapabilityIds:plan.unresolvedCapabilityIds,
    reversibleCapabilities:plan.reversibleCapabilities,
    humanGateCapabilities:plan.humanGateCapabilities,
    forbiddenCapabilities:plan.forbiddenCapabilities,
    showrooms:intentShowrooms(plan),
    execution:'plan_only_until_server_authority_revalidation',
  });
}
async function manifestDrivenApp(request,env){
  const asset=await env.ASSETS.fetch(request);
  if(!asset.ok)return withHeaders(env,asset);
  const source=await asset.text();
  const block=/const SERVICES=\[[\s\S]*?const WORKSPACE_ENTRY_PRIORITY=\[[^\]]*\];/;
  if(!block.test(source)){
    const headers=new Headers(asset.headers);headers.set('x-ekodi-my-services','manifest-fallback');
    return withHeaders(env,new Response(source,{status:asset.status,statusText:asset.statusText,headers}));
  }
  const rewritten=source.replace(block,myServicePreamble());
  const headers=new Headers(asset.headers);
  headers.set('content-type','application/javascript; charset=utf-8');
  headers.set('cache-control','no-store');
  headers.set('x-ekodi-my-services','manifest-v1');
  return withHeaders(env,new Response(rewritten,{status:asset.status,statusText:asset.statusText,headers}));
}
async function routedMyHome(request,env,route=null){
  const target=new URL(request.url);
  target.pathname='/';
  target.search='';
  target.hash='';
  const asset=await env.ASSETS.fetch(new Request(target.toString(),request));
  if(!asset.ok)return withHeaders(env,asset);
  const contentType=asset.headers.get('content-type')||'';
  if(!contentType.includes('text/html'))return withHeaders(env,asset);
  let source=await asset.text();
  if(!source.includes('/private-workspace-router.js'))source=source.replace('</head>',`${PRIVATE_ROUTER_TAG}</head>`);
  if(!source.includes('/access-context.js'))source=source.replace('</head>',`${ACCESS_CONTEXT_TAG}</head>`);
  const headers=new Headers(asset.headers);
  headers.set('content-type','text/html; charset=utf-8');
  headers.set('cache-control','no-store');
  headers.set('x-robots-tag','noindex, nofollow, noarchive');
  if(route){
    headers.set('x-ekodi-private-workspace','v1');
    headers.set('x-ekodi-workspace-service',route.serviceId||'workspace-home');
  }
  const memberGate=route?'shared':'service-owned';
  return injectEkodiShell(withHeaders(env,new Response(source,{status:asset.status,statusText:asset.statusText,headers})),'my','',{memberGate});
}

export default{
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==='/config.js'){
      const cfg=runtimeConfig(env);
      return new Response(`window.EKODI_MY_CONFIG=${JSON.stringify(cfg)};`,{headers:{'content-type':'application/javascript; charset=utf-8','cache-control':'no-store',...securityHeaders(env)}});
    }
    if(url.pathname==='/service-manifest.json')return json(env,{version:EKODI_SERVICE_MANIFEST.version,identityModel:EKODI_SERVICE_MANIFEST.identityModel,services:visibleServices()});
    if(url.pathname==='/capability-registry.json')return json(env,capabilityRegistry);
    if(url.pathname==='/workspace-packs.json')return json(env,workspacePacks);
    if(url.pathname==='/api/intent/plan')return handleIntentPlan(request,env);
    if(url.pathname==='/api/intent/preflight')return handleIntentPreflight(request,env);
    if(url.pathname==='/api/intent/execute')return handleIntentPreflight(request,env,{execute:true});
    if(url.pathname==='/life-channels.json')return json(env,{version:1,policy:'opt-in-least-privilege',proactiveLevels:['quiet','balanced','active'],outboundDefault:'human-approval',channels:[{id:'email',availability:'connector-ready'},{id:'sms',availability:'mobile-bridge-required'},{id:'kakao',availability:'official-api-limited'},{id:'instagram',availability:'provider-permission'},{id:'facebook',availability:'provider-permission'},{id:'slack',availability:'connector-ready'}]});
    if(url.pathname==='/health'){
      const cfg=runtimeConfig(env);
      return json(env,{ok:true,service:'ekodi-my',product:'my-ekodi',identity:'person-scoped',creatorPortfolio:true,personalBrandMarketing:true,universalMembership:true,ekodiShell:true,contextModel:'person-space-role',manifestDrivenServices:true,privateWorkspaceRouting:true,privateWorkspacePath:'/w/{workspace_key}/{service}',accessContextGuidance:true,lifeChannels:true,proactiveUserAi:true,progressivePersonalization:true,intentOs:true,intentPlanContract:'ekodi.intent-plan.v1',intentExecutionBridge:true,intentExecutionContract:'ekodi.intent-execution.v1',capabilityRegistry:'universal-v2',personalizationPolicy:'detect-suggest-consent-activate-learn-fade',personalizationAuthority:'presentation-only',humanGatedOutbound:true,approvalHub:true,approvalPath:'/approvals/',personalFinanceControl:true,personalFinanceBoundary:'dedicated-d1',serviceManifestVersion:EKODI_SERVICE_MANIFEST.version,visibleServices:visibleServices().length,privacy:'private-first',dataMode:cfg.dataMode,dataEnabled:cfg.dataEnabled});
    }
    if(url.pathname==='/approvals')return Response.redirect(new URL('/approvals/',request.url).toString(),307);
    if(url.pathname==='/admin'||url.pathname==='/admin/')return Response.redirect('https://admin.ekodi.kr/?route=workspace&source=my.ekodi.kr',307);
    if(url.pathname==='/creator'||url.pathname==='/creator/')return Response.redirect('https://author.ekodi.kr/',307);
    if(url.pathname==='/personal-brand'||url.pathname==='/personal-brand/')return Response.redirect(personalBrandUrl(),307);
    if(url.pathname==='/app.js')return manifestDrivenApp(request,env);
    if(url.pathname==='/'||url.pathname==='')return routedMyHome(request,env);
    const privateRoute=parsePrivateWorkspacePath(url.pathname);
    if(privateRoute===false)return json(env,{ok:false,error:'private_workspace_route_not_found'},404);
    if(privateRoute)return routedMyHome(request,env,privateRoute);
    const response=withHeaders(env,await env.ASSETS.fetch(request));
    return injectEkodiShell(response,'my');
  }
};
