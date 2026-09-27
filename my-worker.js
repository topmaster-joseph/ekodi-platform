import { injectEkodiShell } from './ekodi-shell-injector.js';
import { EKODI_SERVICE_MANIFEST } from './ekodi-service-manifest.js';
import { routeIntent } from './capability-intent-runtime.js';
import capabilityRegistry from './config/capability-registry.json' with { type: 'json' };
import workspacePacks from './config/workspace-packs.json' with { type: 'json' };

const WORKSPACE_KEY_RE=/^[a-z]+:[a-zA-Z0-9:_-]+$/;
const SERVICE_ID_RE=/^[a-z][a-z0-9-]*$/;
const PUBLIC_PERSON_PATH_RE=/^\/@([a-z0-9][a-z0-9._-]{2,39})\/?$/;
const PRIVATE_ROUTER_TAG='<script src="/my/private-workspace-router.js?v=20260827-private-workspace-1"></script>';
const ACCESS_CONTEXT_TAG='<script type="module" src="/my/access-context.js?v=20260829-common-service-access-1"></script>';
const CANONICAL_MY_ASSET_ALIASES=new Map([
  ['/my/private-workspace-router.js','/private-workspace-router.js'],
  ['/my/access-context.js','/access-context.js'],
]);

function securityHeaders(env={}){
  const connect=["'self'",'https://cdn.jsdelivr.net','https://ekodi.kr','https://marketing-publish-api.ekodi.kr','https://personal-finance-api.ekodi.kr'];
  if(env.SUPABASE_URL){try{connect.push(new URL(env.SUPABASE_URL).origin)}catch{}}
  return {
    'content-security-policy':`default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self'; img-src 'self' data: https:; connect-src ${connect.join(' ')}; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://ekodi.kr https://auth.ekodi.kr; object-src 'none'; upgrade-insecure-requests`,
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
function runtimeConfig(env){const dataEnabled=env.DATA_ENABLED==='true'&&Boolean(env.SUPABASE_URL&&env.SUPABASE_PUBLISHABLE_KEY);return{dataEnabled,dataMode:env.DATA_MODE||'isolated-staging',supabaseUrl:dataEnabled?env.SUPABASE_URL:'',supabasePublishableKey:dataEnabled?env.SUPABASE_PUBLISHABLE_KEY:'',authUrl:env.AUTH_URL||'https://ekodi.kr/auth/?site=my',personalFinanceApi:'https://personal-finance-api.ekodi.kr'}}
function personalBrandUrl(){const target='https://ekodi.kr/ekodibiz/marketing-ai?mode=personal-brand&source=my';return `https://ekodi.kr/auth/?site=marketing&return_to=${encodeURIComponent(target)}`}
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
function parsePublicPersonPath(pathname){
  const match=String(pathname||'').match(PUBLIC_PERSON_PATH_RE);
  return match?match[1]:'';
}
function escapePublicHtml(value){
  return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}
function safePublicLink(value){
  const raw=String(value||'').trim();
  if(!raw)return '';
  try{const url=new URL(raw);return ['https:','http:'].includes(url.protocol)?url.href:''}catch{return ''}
}
function normalizePublicLinks(value){
  return (Array.isArray(value)?value:[]).slice(0,6).map(item=>{
    const url=safePublicLink(item?.url);
    const label=String(item?.label||'').trim().slice(0,60);
    return url?{url,label:label||new URL(url).hostname}:null;
  }).filter(Boolean);
}
function publicProfileHeaders({found=true}={}){
  return {
    'content-type':'text/html; charset=utf-8',
    'cache-control':found?'public, max-age=60, s-maxage=120, stale-while-revalidate=300':'public, max-age=30',
    'content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    'referrer-policy':'no-referrer',
    'x-content-type-options':'nosniff',
    'x-frame-options':'DENY',
    'permissions-policy':'camera=(), microphone=(), geolocation=()',
    'x-ekodi-service':'my-ekodi',
    'x-ekodi-surface-context':'public-person-profile',
    'x-robots-tag':found?'index, follow, max-image-preview:large':'noindex, nofollow, noarchive',
  };
}
async function publicProfileForHandle(env,handle){
  const cfg=runtimeConfig(env);
  if(!cfg.dataEnabled||!handle)return null;
  const endpoint=new URL(`${String(cfg.supabaseUrl).replace(/\/$/,'')}/rest/v1/person_public_profiles`);
  endpoint.searchParams.set('select','handle,display_name,headline,bio,links,updated_at');
  endpoint.searchParams.set('handle',`eq.${handle}`);
  endpoint.searchParams.set('visibility','eq.public');
  endpoint.searchParams.set('limit','1');
  const response=await fetch(endpoint,{headers:{apikey:cfg.supabasePublishableKey,'cache-control':'no-store'}});
  if(!response.ok)return null;
  const rows=await response.json().catch(()=>[]);
  return Array.isArray(rows)&&rows[0]?rows[0]:null;
}
function publicProfileHtml(profile,handle){
  const displayName=String(profile?.display_name||handle).trim().slice(0,120);
  const headline=String(profile?.headline||'').trim().slice(0,160);
  const bio=String(profile?.bio||'').trim().slice(0,2000);
  const links=normalizePublicLinks(profile?.links);
  const description=(headline||bio||`${displayName}의 공개 개인페이지`).replace(/\s+/g,' ').slice(0,160);
  const canonical=`https://ekodi.kr/@${handle}`;
  const linkHtml=links.length?`<nav class="links" aria-label="대표 링크">${links.map(item=>`<a href="${escapePublicHtml(item.url)}" rel="noreferrer"><strong>${escapePublicHtml(item.label)}</strong><span aria-hidden="true">↗</span></a>`).join('')}</nav>`:'';
  const bioHtml=bio?`<p class="bio">${escapePublicHtml(bio)}</p>`:'';
  return `<!doctype html>
<html lang="ko" data-ekodi-global-nav="off" data-ekodi-character="off">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="description" content="${escapePublicHtml(description)}">
<meta name="robots" content="index,follow,max-image-preview:large">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="profile">
<meta property="og:title" content="${escapePublicHtml(displayName)}">
<meta property="og:description" content="${escapePublicHtml(description)}">
<meta property="og:url" content="${canonical}">
<title>${escapePublicHtml(displayName)} · @${escapePublicHtml(handle)}</title>
<style>
:root{color-scheme:light;--ink:#183126;--muted:#66766d;--line:#dce5dc;--paper:#fbfcf8;--green:#29553b}*{box-sizing:border-box}body{margin:0;background:linear-gradient(180deg,#f3f7ef 0,#fbfcf8 38%,#fff 100%);color:var(--ink);font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.6}header,main,footer{width:min(760px,calc(100% - 36px));margin-inline:auto}header{display:flex;justify-content:space-between;gap:16px;align-items:center;padding:22px 0;border-bottom:1px solid var(--line)}.handle{font-size:14px;font-weight:800}.surface{font-size:11px;color:var(--muted);white-space:nowrap}main{padding:clamp(52px,9vw,92px) 0 72px}.eyebrow{font-size:11px;font-weight:800;letter-spacing:.08em;color:#52705e;margin:0 0 10px}.name{font-size:clamp(42px,8vw,72px);line-height:1.05;letter-spacing:-.045em;margin:0}.headline{font-size:clamp(18px,3vw,24px);max-width:640px;margin:20px 0 0;color:#385344;font-weight:650}.bio{white-space:pre-wrap;font-size:16px;max-width:680px;margin:30px 0 0;color:#53665b}.links{display:grid;gap:10px;margin-top:38px}.links a{display:flex;align-items:center;justify-content:space-between;gap:18px;text-decoration:none;color:var(--ink);padding:15px 17px;border:1px solid var(--line);border-radius:15px;background:rgba(255,255,255,.88)}.links a:hover{border-color:#9bb5a2;background:#fff}.links span{color:#6d7e73}footer{padding:22px 0 34px;border-top:1px solid var(--line);font-size:11px;color:#7a877f}.owner-note{margin:0}@media(max-width:520px){header{align-items:flex-start;flex-direction:column;gap:3px}.surface{white-space:normal}main{padding-top:46px}}
</style>
</head>
<body>
<header><span class="handle">@${escapePublicHtml(handle)}</span><span class="surface">공개 개인페이지 · 다른 사람이 보는 곳</span></header>
<main>
<p class="eyebrow">PERSONAL PAGE</p>
<h1 class="name">${escapePublicHtml(displayName)}</h1>
${headline?`<p class="headline">${escapePublicHtml(headline)}</p>`:''}
${bioHtml}
${linkHtml}
</main>
<footer><p class="owner-note">이 페이지의 공개 내용은 본인이 My EKODI에서 관리합니다.</p></footer>
</body>
</html>`;
}
function publicProfileNotFoundHtml(){
  return '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>공개 개인페이지를 찾을 수 없습니다</title><style>body{font-family:system-ui,sans-serif;margin:0;display:grid;place-items:center;min-height:100vh;background:#f7f9f5;color:#23372d}main{width:min(560px,calc(100% - 36px));padding:36px;border:1px solid #dce5dc;border-radius:18px;background:#fff}p{color:#68776e}</style></head><body><main><strong>공개 개인페이지를 찾을 수 없습니다.</strong><p>아직 공개되지 않았거나 주소가 정확하지 않습니다.</p></main></body></html>';
}
async function servePublicProfile(request,env,handle){
  if(!['GET','HEAD'].includes(request.method))return new Response('Method Not Allowed',{status:405,headers:{'allow':'GET, HEAD','cache-control':'no-store'}});
  const profile=await publicProfileForHandle(env,handle).catch(()=>null);
  const found=Boolean(profile);
  const html=found?publicProfileHtml(profile,handle):publicProfileNotFoundHtml();
  return new Response(request.method==='HEAD'?null:html,{status:found?200:404,headers:publicProfileHeaders({found})});
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
  const shellSurface=route?'workspace':'public';
  const memberGate=route?'shared':'service-owned';
  return injectEkodiShell(withHeaders(env,new Response(source,{status:asset.status,statusText:asset.statusText,headers})),'my',shellSurface,{memberGate});
}

export default{
  async fetch(request,env){
    const url=new URL(request.url);
    const publicHandle=parsePublicPersonPath(url.pathname);
    if(publicHandle)return servePublicProfile(request,env,publicHandle);
    const canonicalAsset=CANONICAL_MY_ASSET_ALIASES.get(url.pathname);
    if(canonicalAsset){
      const target=new URL(request.url);target.pathname=canonicalAsset;
      return withHeaders(env,await env.ASSETS.fetch(new Request(target.toString(),request)));
    }
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
      return json(env,{ok:true,service:'ekodi-my',product:'my-ekodi',identity:'person-scoped',creatorPortfolio:true,personalBrandMarketing:true,publicPersonPage:true,publicPersonPath:'/@{handle}',publicPersonManagement:'/my/#account',universalMembership:true,centralAiEntitlements:true,aiEntitlementManager:'/my/',ekodiShell:true,contextModel:'person-space-role',manifestDrivenServices:true,privateWorkspaceRouting:true,privateWorkspacePath:'/w/{workspace_key}/{service}',accessContextGuidance:true,lifeChannels:true,proactiveUserAi:true,progressivePersonalization:true,characterIdentityPersonalization:true,characterPortraitStorage:'local-device-only',intentOs:true,intentPlanContract:'ekodi.intent-plan.v1',intentExecutionBridge:true,intentExecutionContract:'ekodi.intent-execution.v1',capabilityRegistry:'universal-v3',personalizationPolicy:'detect-suggest-consent-activate-learn-fade',personalizationAuthority:'presentation-only',humanGatedOutbound:true,approvalHub:true,approvalPath:'/approvals/',documentWorkspace:true,documentPath:'/docs/',documentCapability:'core.documents',documentContract:'ekodi.documents.v2',documentHwpx:true,documentVersionHistory:true,documentStorage:'person-scoped-rls',documentFormats:{import:['txt','markdown','html','docx','hwpx'],export:['docx','hwpx','html','markdown','txt','pdf']},personalFinanceControl:true,personalFinanceBoundary:'dedicated-d1',serviceManifestVersion:EKODI_SERVICE_MANIFEST.version,visibleServices:visibleServices().length,privacy:'private-first',dataMode:cfg.dataMode,dataEnabled:cfg.dataEnabled});
    }
    if(url.pathname==='/approvals')return Response.redirect(new URL('/approvals/',request.url).toString(),307);
    if(url.pathname==='/admin'||url.pathname==='/admin/')return Response.redirect('https://ekodi.kr/admin/workspaces/workspace?source=my',307);
    if(url.pathname==='/docs')return Response.redirect(new URL('/docs/',request.url).toString(),307);
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
