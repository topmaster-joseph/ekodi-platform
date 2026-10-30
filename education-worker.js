import { injectEkodiShell } from './ekodi-shell-injector.js';
import researchWorker from './education/research/worker.js';
import { instructorGate, isGatedPath, adminUnlock, sessionStatus } from './education-instructor-gate.js';
import { instructorDocs } from './education-instructor-docs.js';
import {educationScreenApi} from './education-screen-share-api.js';
export {EducationScreenRoom} from './education-screen-room.js';

const SECURITY_HEADERS={
  'x-content-type-options':'nosniff',
  'referrer-policy':'strict-origin-when-cross-origin',
  'permissions-policy':'camera=(), microphone=(), geolocation=()',
  'content-security-policy':"default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self'; img-src 'self' data: https:; connect-src 'self' https://renzehysxirjilvdxacv.supabase.co; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests",
};
function runtimeConfig(env){const dataEnabled=env.DATA_ENABLED==='true'&&!!env.SUPABASE_URL&&!!env.SUPABASE_PUBLISHABLE_KEY;return{dataEnabled,dataMode:env.DATA_MODE||'isolated-staging',supabaseUrl:dataEnabled?env.SUPABASE_URL:'',supabasePublishableKey:dataEnabled?env.SUPABASE_PUBLISHABLE_KEY:'',authUrl:env.AUTH_URL||'https://ekodi.kr/auth/?site=edu'}}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...SECURITY_HEADERS}})}
function withHeaders(response){const headers=new Headers(response.headers);for(const [key,value] of Object.entries(SECURITY_HEADERS))headers.set(key,value);if(!headers.has('cache-control'))headers.set('cache-control',response.headers.get('content-type')?.includes('text/html')?'no-cache':'public, max-age=300');return new Response(response.body,{status:response.status,statusText:response.statusText,headers})}
async function assetFor(request,env,path){const url=new URL(request.url);url.pathname=path;return env.ASSETS.fetch(new Request(url,request))}
export default{
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==='/research'||url.pathname.startsWith('/research/'))return researchWorker.fetch(request,env);
    if(url.pathname==='/health')return json({ok:true,service:'ekodi-education',surface:'education-platform',areas:['admission','study'],contextModel:'person-space-role',officialSourceRequired:true,submissionExecution:false,sensitiveDocumentStorage:false,instructorDocumentShare:'instructor-own-documents-expiring-links',dataMode:runtimeConfig(env).dataMode,ekodiShell:true});
    if(url.pathname==='/config.js')return new Response(`window.EKODI_EDU_CONFIG=${JSON.stringify(runtimeConfig(env))};`,{headers:{'content-type':'application/javascript; charset=utf-8','cache-control':'no-store',...SECURITY_HEADERS}});
    if(url.pathname==='/admin'||url.pathname==='/admin/')return Response.redirect('https://ekodi.kr/admin/',307);
    const screenShare=await educationScreenApi(request,env,{url});
    if(screenShare)return screenShare;
    // EKODI super admin → instructor session (central admin token verified server-side, super_admin only).
    const admin=await adminUnlock(request,env,{url});
    if(admin)return admin;
    const status=await sessionStatus(request,env,{url});
    if(status)return status;
    // Instructor document share: public expiring view links + instructor-session management API.
    const docs=await instructorDocs(request,env,{url});
    if(docs)return docs;
    // Premium Studio operator surfaces (instructor studio, presenter, facilitation notes) are instructor-only.
    const gate=await instructorGate(request,env,{url});
    if(gate)return injectEkodiShell(withHeaders(gate),'edu');
    let response;
    if(url.pathname==='/admission'||url.pathname==='/admission/')response=await assetFor(request,env,'/admission/');
    else if(url.pathname==='/study'||url.pathname==='/study/')response=await assetFor(request,env,'/study/');
    else response=await env.ASSETS.fetch(request);
    response=withHeaders(response);
    if(isGatedPath(url.pathname))response.headers.set('cache-control','private, no-store');
    // The presenter shows the Learner Lab inside its own stage (same origin only).
    if(/^\/study\/live\/lab(?:\/|$)/.test(url.pathname)){response.headers.set('content-security-policy',SECURITY_HEADERS['content-security-policy'].replace("frame-ancestors 'none'","frame-ancestors 'self'"));response.headers.set('x-frame-options','SAMEORIGIN');}
    if(url.pathname.startsWith('/study/live/screen-share/'))
      response.headers.set('content-security-policy',SECURITY_HEADERS['content-security-policy'].replace("connect-src 'self' ","connect-src 'self' wss://ekodi.kr "));
    if(url.pathname.startsWith('/study/live/screen-share/'))response.headers.set('referrer-policy','no-referrer');
    return injectEkodiShell(response,'edu');
  }
};
