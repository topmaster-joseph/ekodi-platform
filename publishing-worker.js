import { handlePublishingWorkflow, prepareScheduledPublishing } from './publishing-workflow-api.js';
import { injectEkodiShell } from './ekodi-shell-injector.js';
import { handlePrivateReleaseAdmin } from './publishing/human/private-release-api.js';
import { runConfiguredPublishingReleaseTick } from './publishing/human/private-release-scheduler.js';

const SECURITY_HEADERS={
  'x-content-type-options':'nosniff',
  'referrer-policy':'strict-origin-when-cross-origin',
  'permissions-policy':'camera=(), microphone=(), geolocation=()',
};
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...SECURITY_HEADERS}})}
function withHeaders(response){const headers=new Headers(response.headers);for(const [key,value] of Object.entries(SECURITY_HEADERS))headers.set(key,value);return new Response(response.body,{status:response.status,statusText:response.statusText,headers})}

export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if (url.pathname.startsWith('/publishing/api/workflow/') || url.pathname.startsWith('/api/workflow/')) return handlePublishingWorkflow(request,env);
    if(url.pathname==='/api/private-releases'||url.pathname.startsWith('/api/private-releases/')){
      const reply=await handlePrivateReleaseAdmin(request,env);
      if(reply)return reply;
    }
    if(url.pathname==='/health')return json({
      ok:true,
      service:'ekodi-publishing',
      publicName:'출판',
      professionalService:true,
      independentPlatform:true,
      modules:['consultation','production','distribution','studio','upaper'],
      identityModel:'person-space-role',
      shell:'v2',
      membership:'universal-free-lazy',
      aiDependency:'optional',
      providerFailureMode:'core',
      adminSeparated:true,
      bookstoreRelationship:'explicit-public-handoff-only',
      privateCrossServiceDataAccess:false,
      externalSubmissionExecution:false
    });
    // PUBLISHING-ADMIN-001 (§12): 출판 고유 관리자 화면. 인증은 공통 EKODI 계정, 권한은 출판 원장 역할(서버)로 판단한다.
    if(url.pathname==='/admin'||url.pathname==='/admin.html')return Response.redirect('https://ekodi.kr/publishing/admin/',308);
    if(url.pathname.startsWith('/admin/')){
      const asset=/\.[a-z0-9]+$/i.test(url.pathname);
      const target=new URL(request.url);if(!asset)target.pathname='/admin/';
      const res=withHeaders(await env.ASSETS.fetch(new Request(target,request)));
      const out=new Response(res.body,res);
      out.headers.set('x-robots-tag','noindex, nofollow, noarchive');out.headers.set('cache-control','no-store');
      return asset?out:injectEkodiShell(out,'publishing','admin');
    }
    if(url.pathname==='/books.json'){
      // Use a private Service Binding: public apex-to-apex fetch can recurse or fail on Workers.
      if(!env?.BOOKS?.fetch)return json({ok:false,error:'PUBLIC_BOOK_CATALOG_UNAVAILABLE'},503);
      const catalogUrl=new URL(request.url);
      catalogUrl.pathname='/books.json';
      catalogUrl.search='';
      const upstream=await env.BOOKS.fetch(new Request(catalogUrl,{method:'GET',headers:{accept:'application/json'}}));
      return new Response(upstream.body,{status:upstream.status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...SECURITY_HEADERS}});
    }
    if(url.pathname==='/publishing/'||url.pathname==='/publishing')return Response.redirect('https://ekodi.kr/publishing/',308);
    if(url.pathname.startsWith('/publishing/studio'))return Response.redirect('https://ekodi.kr/publishing/studio/',308);
    if(url.pathname.startsWith('/publishing/upaper'))return Response.redirect('https://ekodi.kr/publishing/upaper/',308);
    return injectEkodiShell(withHeaders(await env.ASSETS.fetch(request)),'publishing');
  },
  // Intentionally inert until an owner-reviewed separate Worker binding and
  // cron configuration explicitly enable the private publishing release lane.
  // One scheduled entry point (no cron is configured here; the EKODI Orchestrator's
  // approved scheduler owns timing). Each lane stays independently guarded.
  async scheduled(controller,env,ctx){
    // Due approved work moves into a protected outbox, never directly to public sale.
    if(env?.PUBLISH_DB)await prepareScheduledPublishing(env);
    if(env?.PUBLISHING_PRIVATE_RELEASE_ENABLED!=='true')return;
    const scheduledTime=controller?.scheduledTime;
    const nowIso=new Date(Number.isFinite(scheduledTime)?scheduledTime:Date.now()).toISOString();
    const task=runConfiguredPublishingReleaseTick(env,nowIso);
    if(ctx?.waitUntil)ctx.waitUntil(task);
    else await task;
  }
};
