import capabilityConfig from './config/ai-capabilities.json';
import packConfig from './config/workspace-packs.json';
import ecosystemConfig from './config/ecosystem-services.json';
import { buildWorkspaceBlueprint } from './ai-capability-orchestrator.js';

function securityHeaders(env={}){
  const connect=["'self'",'https://cdn.jsdelivr.net'];
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
function withHeaders(env,response){const headers=new Headers(response.headers);for(const [key,value] of Object.entries(securityHeaders(env)))headers.set(key,value);if(!headers.has('cache-control'))headers.set('cache-control',response.headers.get('content-type')?.includes('text/html')?'no-store':'public, max-age=300');return new Response(response.body,{status:response.status,statusText:response.statusText,headers})}
function runtimeConfig(env){const dataEnabled=env.DATA_ENABLED==='true'&&Boolean(env.SUPABASE_URL&&env.SUPABASE_PUBLISHABLE_KEY);return{dataEnabled,dataMode:env.DATA_MODE||'isolated-staging',supabaseUrl:dataEnabled?env.SUPABASE_URL:'',supabasePublishableKey:dataEnabled?env.SUPABASE_PUBLISHABLE_KEY:'',authUrl:env.AUTH_URL||'https://auth.ekodi.kr/?site=my'}}

const ALLOWED_AUDIENCES=new Set(['person','business','organization','community','team','church']);
const capabilityById=new Map((capabilityConfig.capabilities||[]).map(item=>[item.id,item]));
const packById=new Map((packConfig.packs||[]).map(item=>[item.id,item]));
const serviceById=new Map((ecosystemConfig.services||[]).filter(item=>item.productionVerified===true).map(item=>[item.id,item]));

async function navigator(env,request){
  if(request.method!=='POST')return json(env,{ok:false,error:'method_not_allowed'},405);
  const contentLength=Number(request.headers.get('content-length')||0);
  if(contentLength>4096)return json(env,{ok:false,error:'payload_too_large'},413);
  let body={};
  try{body=await request.json()}catch{return json(env,{ok:false,error:'invalid_json'},400)}
  const text=String(body?.text||'').trim().slice(0,600);
  const requestedAudience=String(body?.audience||'person').trim().toLowerCase();
  const audience=ALLOWED_AUDIENCES.has(requestedAudience)?requestedAudience:'person';
  const blueprint=buildWorkspaceBlueprint({text,audience},{capabilities:capabilityConfig,packs:packConfig},{limit:3});
  const recommendations=blueprint.recommendations.map(item=>{
    const pack=packById.get(item.id)||{};
    return {id:item.id,name:pack.name||item.id,description:pack.description||'',matchedSignals:item.matchedSignals||[],audiences:pack.audiences||[]};
  });
  const capabilities=blueprint.capabilityIds.map(id=>capabilityById.get(id)).filter(Boolean).map(item=>({id:item.id,name:item.name,domain:item.domain,actionTier:item.actionTier,description:item.description}));
  const showrooms=blueprint.showroomEntries.map(id=>serviceById.get(id)).filter(Boolean).map(item=>({id:item.id,name:item.name,url:item.url}));
  return json(env,{ok:true,mode:'read-only',home:blueprint.home,audience,recommendations,capabilities,humanGateCapabilities:blueprint.humanGateCapabilities,showrooms,dedicatedSiteRecommended:false});
}

export default{
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==='/config.js'){
      const cfg=runtimeConfig(env);
      return new Response(`window.EKODI_MY_CONFIG=${JSON.stringify(cfg)};`,{headers:{'content-type':'application/javascript; charset=utf-8','cache-control':'no-store',...securityHeaders(env)}});
    }
    if(url.pathname==='/health'){
      const cfg=runtimeConfig(env);
      return json(env,{ok:true,service:'ekodi-my',product:'my-ekodi',identity:'person-scoped',creatorPortfolio:true,aiNavigator:true,capabilityCount:(capabilityConfig.capabilities||[]).length,privacy:'private-first',dataMode:cfg.dataMode,dataEnabled:cfg.dataEnabled});
    }
    if(url.pathname==='/api/navigator')return navigator(env,request);
    if(url.pathname==='/creator'||url.pathname==='/creator/')return Response.redirect('https://author.ekodi.kr/',307);
    return withHeaders(env,await env.ASSETS.fetch(request));
  }
};