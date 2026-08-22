import { injectEkodiShell } from './ekodi-shell-injector.js';

const SECURITY_HEADERS={
  'x-content-type-options':'nosniff',
  'referrer-policy':'strict-origin-when-cross-origin',
  'permissions-policy':'camera=(), microphone=(), geolocation=()',
  'content-security-policy':"default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self'; img-src 'self' data: https:; connect-src 'self' https://renzehysxirjilvdxacv.supabase.co; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests",
};
function runtimeConfig(env){const dataEnabled=env.DATA_ENABLED==='true'&&!!env.SUPABASE_URL&&!!env.SUPABASE_PUBLISHABLE_KEY;return{dataEnabled,dataMode:env.DATA_MODE||'isolated-staging',supabaseUrl:dataEnabled?env.SUPABASE_URL:'',supabasePublishableKey:dataEnabled?env.SUPABASE_PUBLISHABLE_KEY:'',authUrl:env.AUTH_URL||'https://auth.ekodi.kr/?site=edu',journeyUrl:'https://my.ekodi.kr/journey/'}}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...SECURITY_HEADERS}})}
function withHeaders(response){const headers=new Headers(response.headers);for(const [key,value] of Object.entries(SECURITY_HEADERS))headers.set(key,value);if(!headers.has('cache-control'))headers.set('cache-control',response.headers.get('content-type')?.includes('text/html')?'no-cache':'public, max-age=300');return new Response(response.body,{status:response.status,statusText:response.statusText,headers})}
async function assetFor(request,env,path){const url=new URL(request.url);url.pathname=path;return env.ASSETS.fetch(new Request(url,request))}
export default{
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==='/health')return json({ok:true,service:'ekodi-education',surface:'education-platform',areas:['admission','study'],contextModel:'person-space-role',officialSourceRequired:true,submissionExecution:false,sensitiveDocumentStorage:false,dataMode:runtimeConfig(env).dataMode,ekodiShell:true});
    if(url.pathname==='/config.js')return new Response(`window.EKODI_EDU_CONFIG=${JSON.stringify(runtimeConfig(env))};`,{headers:{'content-type':'application/javascript; charset=utf-8','cache-control':'no-store',...SECURITY_HEADERS}});
    if(url.pathname==='/admin'||url.pathname==='/admin/')return Response.redirect('https://admin.ekodi.kr/education',307);
    let response;
    if(url.pathname==='/admission'||url.pathname==='/admission/')response=await assetFor(request,env,'/admission/index.html');
    else if(url.pathname==='/study'||url.pathname==='/study/')response=await assetFor(request,env,'/study/index.html');
    else response=await env.ASSETS.fetch(request);
    return injectEkodiShell(withHeaders(response),'edu');
  }
};
