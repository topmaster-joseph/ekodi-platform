import { injectEkodiShell } from './ekodi-shell-injector.js';
import { LIFE_AI_CORE, buildLifeAiPrompt, buildLifeReflection, lifeTopics, todayLifeQuestion } from './life-core.js';

const USER_CHROME_CONTRACT='shared-csp-safe-v1';
const SECURITY_HEADERS={
  'x-content-type-options':'nosniff',
  'referrer-policy':'strict-origin-when-cross-origin',
  'permissions-policy':'camera=(), microphone=(), geolocation=()',
  'content-security-policy':"default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self'; img-src 'self' data: https:; connect-src 'self' https://renzehysxirjilvdxacv.supabase.co https://api.ekodi.kr; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests",
};
function config(env){
  const dataEnabled=env.DATA_ENABLED==='true'&&!!env.SUPABASE_URL&&!!env.SUPABASE_PUBLISHABLE_KEY;
  return {dataEnabled,dataMode:env.DATA_MODE||'production',supabaseUrl:dataEnabled?env.SUPABASE_URL:'',supabasePublishableKey:dataEnabled?env.SUPABASE_PUBLISHABLE_KEY:'',authUrl:env.AUTH_URL||'https://auth.ekodi.kr/?site=life',coreApiUrl:env.CORE_API_URL||'https://api.ekodi.kr'};
}
const CORS_ORIGINS=new Set(['https://life.ekodi.kr','https://admin.ekodi.kr','https://my.ekodi.kr']);
function corsHeaders(request){const origin=request?.headers?.get?.('origin')||'';return origin&&CORS_ORIGINS.has(origin)?{'access-control-allow-origin':origin,'access-control-allow-headers':'authorization,content-type','access-control-allow-methods':'GET,POST,OPTIONS',vary:'Origin'}:{}}
function json(data,status=200,request=null){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...corsHeaders(request),...SECURITY_HEADERS}})}
function withHeaders(response){const headers=new Headers(response.headers);for(const [k,v] of Object.entries(SECURITY_HEADERS))headers.set(k,v);if(!headers.has('cache-control'))headers.set('cache-control',response.headers.get('content-type')?.includes('text/html')?'no-cache':'public, max-age=300');return new Response(response.body,{status:response.status,statusText:response.statusText,headers})}
async function safeAssetFetch(env,request){try{return await env.ASSETS.fetch(request)}catch{return new Response('인생AI를 잠시 불러오지 못했습니다.',{status:503,headers:{'content-type':'text/plain; charset=utf-8','cache-control':'no-store','x-ekodi-life-asset-error':'fetch_failed',...SECURITY_HEADERS}})}}
async function readBody(request){try{return await request.json()}catch{return null}}
function bearer(request){return String(request.headers.get('authorization')||'').trim()}
async function memberAuthorized(request,env){
  const auth=bearer(request);if(!auth.toLowerCase().startsWith('bearer '))return false;
  const token=auth.slice(7).trim();if(!token||token.length>8192)return false;
  const cfg=config(env);if(!cfg.dataEnabled)return true;
  try{const r=await fetch(`${cfg.supabaseUrl}/auth/v1/user`,{headers:{apikey:cfg.supabasePublishableKey,authorization:`Bearer ${token}`}});if(!r.ok)return false;const user=await r.json();return Boolean(user?.id&&user?.email)}catch{return false}
}

async function loadTenantProfile(request,env){
  const host=new URL(request.url).hostname.toLowerCase();
  const base={host,brandName:'오늘의 질문',platformName:'인생AI',tagline:'당신의 삶을 함께 생각합니다',communityLabel:'사람과 함께 나누기'};
  const cfg=config(env);if(!cfg.dataEnabled)return base;
  try{
    const url=new URL(`${cfg.supabaseUrl}/rest/v1/life_tenant_profiles`);
    url.searchParams.set('select','host,brand_name,platform_name,tagline,community_label');
    url.searchParams.set('host',`eq.${host}`);url.searchParams.set('active','eq.true');url.searchParams.set('limit','1');
    const r=await fetch(url,{headers:{apikey:cfg.supabasePublishableKey,authorization:`Bearer ${cfg.supabasePublishableKey}`}});
    if(!r.ok)return base;const rows=await r.json();const row=Array.isArray(rows)?rows[0]:null;if(!row)return base;
    return {...base,brandName:row.brand_name||base.brandName,platformName:row.platform_name||base.platformName,tagline:row.tagline||base.tagline,communityLabel:row.community_label||base.communityLabel};
  }catch{return base}
}

async function aiReply(request,env){
  const body=await readBody(request);if(!body)return json({error:'유효한 JSON 요청이 필요합니다.',code:'LIFE_INVALID_JSON'},400);
  const message=String(body.message||'').trim().slice(0,4000);if(!message)return json({error:'이야기를 입력해 주세요.',code:'LIFE_EMPTY_MESSAGE'},400);
  const reflection=buildLifeReflection({message,topic:String(body.topic||'')});
  if(reflection.urgent)return json({ok:true,mode:'safety-first',reflection,reply:reflection.notice});
  const token=bearer(request);if(!token)return json({error:'Google 로그인한 무료회원부터 이용할 수 있습니다.',code:'LIFE_AUTH_REQUIRED'},401,request);
  const cfg=config(env);let upstream;
  try{upstream=await fetch(`${cfg.coreApiUrl}/api/user-ai/assist`,{method:'POST',headers:{authorization:token,'content-type':'application/json'},body:JSON.stringify({site:'life',intent:'interactive',aiRequired:true,dataClass:'general',message:buildLifeAiPrompt({message,topic:reflection.topic.id,reflection})})})}
  catch{return json({ok:false,mode:'core-only',reflection,reply:reflection.nextQuestion,notice:'AI 연결이 어려워 기본 질문으로 계속합니다.'},200,request)}
  const data=await upstream.json().catch(()=>({}));
  if(!upstream.ok)return json({ok:false,mode:'core-only',reflection,reply:reflection.nextQuestion,notice:data.error||'AI 연결이 어려워 기본 질문으로 계속합니다.'},200);
  return json({ok:true,reflection,...data});
}

export default{
  async fetch(request,env){
    const url=new URL(request.url);
    if(request.method==='OPTIONS'&&url.pathname.startsWith('/api/'))return new Response(null,{status:204,headers:{...corsHeaders(request),...SECURITY_HEADERS}});
    if(url.pathname==='/health')return json({ok:true,service:'ekodi-life-ai',brand:'오늘의 질문',platform:'인생AI',stages:[1,2,3,4,5],areas:lifeTopics().map(x=>x.id),core:LIFE_AI_CORE,dataMode:config(env).dataMode,ekodiShell:true,userChrome:USER_CHROME_CONTRACT,whiteLabel:true},200,request);
    if(url.pathname==='/config.js')return new Response(`window.EKODI_LIFE_CONFIG=${JSON.stringify(config(env))};`,{headers:{'content-type':'application/javascript; charset=utf-8','cache-control':'no-store',...SECURITY_HEADERS}});
    if(request.method==='GET'&&url.pathname==='/api/today')return json({...todayLifeQuestion(),topics:lifeTopics()},200,request);
    if(request.method==='GET'&&url.pathname==='/api/tenant')return json(await loadTenantProfile(request,env),200,request);
    if(request.method==='GET'&&url.pathname==='/api/journey'){
      const auth=bearer(request);if(!auth.toLowerCase().startsWith('bearer '))return json({error:'Google 로그인이 필요합니다.',code:'LIFE_AUTH_REQUIRED'},401,request);
      const cfg=config(env);if(!cfg.dataEnabled)return json({reflections:[]},200,request);
      let response;try{response=await fetch(`${cfg.supabaseUrl}/rest/v1/life_reflections?select=id,topic,question_text,root_question,scriptures,next_question,action_text,created_at&order=created_at.desc&limit=20`,{headers:{apikey:cfg.supabasePublishableKey,authorization:auth}})}catch{return json({error:'나의 질문을 불러오지 못했습니다.',code:'LIFE_JOURNEY_UNAVAILABLE'},503,request)}
      const data=await response.json().catch(()=>[]);if(!response.ok)return json({error:'나의 질문을 불러오지 못했습니다.',code:'LIFE_JOURNEY_READ_FAILED'},response.status,request);
      return json({reflections:Array.isArray(data)?data:[]},200,request);
    }
    if(request.method==='POST'&&url.pathname==='/api/reflect'){
      if(!(await memberAuthorized(request,env)))return json({error:'Google 로그인한 무료회원부터 이용할 수 있습니다.',code:'LIFE_AUTH_REQUIRED'},401,request);
      const body=await readBody(request);if(!body)return json({error:'유효한 JSON 요청이 필요합니다.',code:'LIFE_INVALID_JSON'},400);
      return json({ok:true,reflection:buildLifeReflection({message:String(body.message||''),topic:String(body.topic||'')})});
    }
    if(request.method==='POST'&&url.pathname==='/api/ai')return aiReply(request,env);
    if(url.pathname==='/admin'||url.pathname==='/admin/')return Response.redirect('https://admin.ekodi.kr/#life-ai',307);
    if(url.pathname==='/my'||url.pathname==='/my/')return Response.redirect('https://my.ekodi.kr/journey/?source=life',307);
    let response=await safeAssetFetch(env,request);
    if(response.status===404&&!url.pathname.includes('.')){const root=new URL(request.url);root.pathname='/';response=await safeAssetFetch(env,new Request(root,request))}
    return injectEkodiShell(withHeaders(response),'life');
  }
};
