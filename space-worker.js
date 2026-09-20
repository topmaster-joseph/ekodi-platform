import { realtimeTenant } from './realtime-tenant-registry.js';
import { tenantLivePage } from './tenant-live-page.js';
import { isPublicWorkspacePath, workspaceRouteFromPublicPath, workspaceSlugFromPublicPath } from './workspace-route-policy.js';
import { renderStorefrontPage, storefrontCss } from './storefront-page.js';
import { renderJadamStorefrontPage, jadamStorefrontCss } from './jadam-storefront.js';
import { renderRestaurantStorefrontPage, restaurantStorefrontCss } from './restaurant-storefront.js';
import { isOrganizationWorkspaceSlug, renderOrganizationPublicPage } from './organization-public-page.js';

const EKODIMISSION_PREFIX='/ekodimission';
const EKODIMISSION_PUBLIC_ROUTE='ekodimission-public';
const MISSION_EVENT_RECORD_KEY='260926-chuseok-open-table';
const MISSION_EVENT_SLUG='260926-chuseok-open-table';
const MISSION_EVENT_PATH=`/ekodimission/activities/${MISSION_EVENT_SLUG}`;
const MISSION_EVENT_LEGACY_PATHS=new Set(['/ekodimission/activities/260925-chuseok-open-table','/ekodimission/activities/2026-chuseok-open-table']);
const MISSION_EVENT_APPLICATION_API=`/ekodimission/api/activities/${MISSION_EVENT_RECORD_KEY}/applications`;
const EKODIMISSION_PAGES=new Map([['/ekodimission','/ekodimission.page'],['/ekodimission/vision','/ekodimission-vision.page'],['/ekodimission/activities','/ekodimission-activities.page'],[MISSION_EVENT_PATH,'/ekodimission-activity.page'],['/ekodimission/prayer','/ekodimission-prayer.page'],['/ekodimission/participate','/ekodimission-participate.page'],['/ekodimission/partners','/ekodimission-partners.page'],['/ekodimission/stories','/ekodimission-stories.page'],['/ekodimission/give','/ekodimission-give.page'],['/ekodimission/transparency','/ekodimission-transparency.page'],['/ekodimission/contact','/ekodimission-contact.page']]);
const EKODIMISSION_ASSETS=new Map([['/ekodimission/assets/site.css','/ekodimission.css'],['/ekodimission/assets/site.js','/ekodimission.js'],['/ekodimission/assets/shell.css','/ekodimission-shell.css'],['/ekodimission/assets/shell.js','/ekodimission-shell.js'],['/ekodimission/assets/mission-table-hero.svg','/mission-table-hero.svg'],['/ekodimission/assets/open-table-hero-260926.svg','/open-table-hero-260926.svg'],['/ekodimission/assets/open-table-meal-260925.jpg','/open-table-meal-260925.jpg']]);
function normalizedMissionPath(pathname){const clean=String(pathname||'').replace(/\/+$/,'');return clean||'/'}
function publishMissionHtml(html){return String(html||'').replace(/<meta name="robots" content="noindex,nofollow,noarchive">/gi,'<meta name="robots" content="index,follow">').replace(/<div class="review-banner">[\s\S]*?<\/div>/i,'')}
function brandSiteResponse(response){response.headers.set('x-ekodi-independent-site','true');response.headers.set('x-ekodi-site-class','brand-site');response.headers.set('x-ekodi-workspace','ekodimission');response.headers.set('x-ekodi-publication-status','published');return response;}
async function routeEkodiMission(request,env){
  const url=new URL(request.url);const pathname=normalizedMissionPath(url.pathname);
  if(MISSION_EVENT_LEGACY_PATHS.has(pathname)){const target=new URL(MISSION_EVENT_PATH+url.search,'https://ekodi.kr');return new Response(null,{status:308,headers:{location:target.toString(),'cache-control':'no-store','x-ekodi-route':'ekodimission-event-canonical','x-ekodi-publication-status':'published'}});}
  if(pathname==='/ekodimission/live'){
    const tenant=realtimeTenant('ekodimission');if(!tenant)return withHeaders(env,new Response('Not Found',{status:404}),'ekodimission-not-found');
    return brandSiteResponse(withHeaders(env,tenantLivePage(tenant),EKODIMISSION_PUBLIC_ROUTE));
  }
  const assetPath=EKODIMISSION_PAGES.get(pathname)||EKODIMISSION_ASSETS.get(pathname);
  if(!assetPath)return brandSiteResponse(withHeaders(env,new Response('Not Found',{status:404,headers:{'content-type':'text/plain; charset=utf-8'}}),'ekodimission-not-found'));
  const target=new URL(request.url);target.pathname=assetPath;target.search='';const asset=await env.ASSETS.fetch(new Request(target.toString(),request));
  const isPage=EKODIMISSION_PAGES.has(pathname);let served=asset;
  if(isPage){const headers=new Headers(asset.headers);headers.set('content-type','text/html; charset=utf-8');headers.delete('content-length');const html=publishMissionHtml(await asset.text());served=new Response(request.method==='HEAD'?null:html,{status:asset.status,statusText:asset.statusText,headers});}
  return brandSiteResponse(withHeaders(env,served,EKODIMISSION_ASSETS.has(pathname)?'ekodimission-asset':EKODIMISSION_PUBLIC_ROUTE));
}

const DEFAULT_PAGE_PROFILE=Object.freeze({
  documentTitle:'운영공간 · EKODI',name:'내 운영공간',kicker:'OPERATING SPACE',
  lead:'로그인 후 내가 운영하거나 참여하는 점포와 조직만 표시합니다.',theme:'default',
  description:'EKODI 점포 운영공간',robots:'noindex,nofollow,noarchive'
});
const STORE_PAGE_PROFILES=Object.freeze({
  jadam:{documentTitle:'자담치킨 목포대점 · EKODI',name:'자담치킨 목포대점',kicker:'CHICKEN STORE USER PAGE',lead:'치킨 메뉴·가격·배달채널을 자담치킨 데이터로만 분리해 운영합니다.',theme:'jadam',description:'자담치킨 목포대점 사용자 운영페이지',robots:'index,follow'},
  pizzamaru:{documentTitle:'피자마루 목포대점 · EKODI',name:'피자마루 목포대점',kicker:'PIZZA STORE USER PAGE',lead:'피자 메뉴·옵션·판매가·배달채널을 피자마루 데이터로만 분리해 운영합니다.',theme:'pizzamaru',description:'피자마루 목포대점 사용자 운영페이지',robots:'index,follow'},
  yogurt:{documentTitle:'요거트퍼플 목포대점 · 메뉴 · 배달주문',name:'요거트퍼플 목포대점',kicker:'YOGURT PURPLE · MOKPO UNIVERSITY',lead:'국립목포대학교 후문, 요거트퍼플 목포대점에서 상큼한 디저트를 만나보세요.',theme:'yogurt',description:'요거트퍼플 목포대점 메뉴·매장안내·배달주문',robots:'index,follow'},
});
function staticPageProfile(pathname){const slug=workspaceSlugFromPublicPath(pathname);return STORE_PAGE_PROFILES[slug]||DEFAULT_PAGE_PROFILE}
async function pageProfile(pathname,env){
  const slug=workspaceSlugFromPublicPath(pathname);
  const fallback=staticPageProfile(pathname);
  if(!slug||!env.SUPABASE_URL||!env.SUPABASE_PUBLISHABLE_KEY)return {profile:fallback,canonicalSlug:slug,status:'active',source:'static',storefront:Boolean(STORE_PAGE_PROFILES[slug])};
  try{
    const response=await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/store_user_site_public_profile`,{
      method:'POST',headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,'content-type':'application/json'},body:JSON.stringify({p_slug:slug})
    });
    if(!response.ok)return {profile:fallback,canonicalSlug:slug,status:'active',source:'fallback',storefront:Boolean(STORE_PAGE_PROFILES[slug])};
    const data=await response.json().catch(()=>null);
    if(!data||typeof data!=='object')return {profile:fallback,canonicalSlug:slug,status:'active',source:'fallback',storefront:Boolean(STORE_PAGE_PROFILES[slug])};
    return {profile:{documentTitle:data.document_title||`${data.name||fallback.name} · EKODI`,name:data.name||fallback.name,kicker:data.kicker||fallback.kicker,lead:data.lead||fallback.lead,theme:data.theme||fallback.theme,description:data.description||fallback.description,robots:fallback.robots||'index,follow'},canonicalSlug:data.canonical_slug||slug,status:data.status||'active',source:'store-user-sites',storefront:true};
  }catch{return {profile:fallback,canonicalSlug:slug,status:'active',source:'fallback',storefront:Boolean(STORE_PAGE_PROFILES[slug])}}
}
function htmlText(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))}

function securityHeaders(env={}){
  const connect=["'self'",'https://cdn.jsdelivr.net'];
  if(env.SUPABASE_URL){try{connect.push(new URL(env.SUPABASE_URL).origin)}catch{}}
  return {
    'content-security-policy':`default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self'; img-src 'self' data: https:; connect-src ${connect.join(' ')}; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://ekodi.kr; object-src 'none'; upgrade-insecure-requests`,
    'referrer-policy':'no-referrer',
    'x-content-type-options':'nosniff',
    'x-frame-options':'DENY',
    'permissions-policy':'camera=(), microphone=(), geolocation=(), usb=()',
    'x-ekodi-service':'space',
  };
}
function withHeaders(env,response,route='asset'){
  const headers=new Headers(response.headers);
  for(const [key,value] of Object.entries(securityHeaders(env)))headers.set(key,value);
  headers.set('x-ekodi-route',route);
  const contentType=headers.get('content-type')||'';
  if(contentType.includes('text/html')){
    headers.set('cache-control','no-store');
    headers.set('x-robots-tag',['space-storefront','space-organization',EKODIMISSION_PUBLIC_ROUTE].includes(route)?'index, follow':'noindex, nofollow, noarchive');
  }else if(!headers.has('cache-control'))headers.set('cache-control','public, max-age=300');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
function json(env,data,status=200){return withHeaders(env,new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}}),'api')}
function missionApplicationError(message=''){
  const text=String(message||'');
  if(text.includes('APPLICATION_CLOSED'))return ['application_closed','신청이 마감되었습니다.',409];
  if(text.includes('PRIVACY_CONSENT_REQUIRED'))return ['privacy_consent_required','개인정보 수집·이용 동의가 필요합니다.',400];
  if(text.includes('INVALID_NAME'))return ['invalid_name','이름을 확인해 주세요.',400];
  if(text.includes('INVALID_PHONE'))return ['invalid_phone','연락처를 확인해 주세요.',400];
  if(text.includes('INVALID_EMAIL'))return ['invalid_email','이메일 주소를 확인해 주세요.',400];
  if(text.includes('INVALID_PARTY_SIZE'))return ['invalid_party_size','참여 인원을 확인해 주세요.',400];
  return ['application_unavailable','신청을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.',503];
}
async function submitMissionEventApplication(request,env){
  if(request.method==='OPTIONS')return withHeaders(env,new Response(null,{status:204,headers:{allow:'POST, OPTIONS','cache-control':'no-store'}}),'ekodimission-application-api');
  if(request.method!=='POST')return json(env,{ok:false,error:'method_not_allowed'},405);
  const url=new URL(request.url);const origin=String(request.headers.get('origin')||'');
  if(url.hostname==='ekodi.kr'&&origin&&origin!=='https://ekodi.kr')return json(env,{ok:false,error:'origin_not_allowed'},403);
  const length=Number(request.headers.get('content-length')||0);if(length>16384)return json(env,{ok:false,error:'payload_too_large'},413);
  if(env.DATA_ENABLED!=='true'||!env.SUPABASE_URL||!env.SUPABASE_PUBLISHABLE_KEY)return json(env,{ok:false,error:'application_storage_unavailable'},503);
  let body;try{body=await request.json();}catch{return json(env,{ok:false,error:'invalid_json'},400)}
  const name=String(body?.name||'').trim();const phone=String(body?.phone||'').trim();const email=String(body?.email||'').trim();const partySize=Number(body?.partySize||1);
  if(!name||name.length>80)return json(env,{ok:false,error:'invalid_name',message:'이름을 확인해 주세요.'},400);
  if(phone.replace(/[^0-9+]/g,'').length<8||phone.length>40)return json(env,{ok:false,error:'invalid_phone',message:'연락처를 확인해 주세요.'},400);
  if(!Number.isInteger(partySize)||partySize<1||partySize>20)return json(env,{ok:false,error:'invalid_party_size',message:'참여 인원을 확인해 주세요.'},400);
  if(body?.privacyConsent!==true)return json(env,{ok:false,error:'privacy_consent_required',message:'개인정보 수집·이용 동의가 필요합니다.'},400);
  const rpcBody={p_event_key:MISSION_EVENT_RECORD_KEY,p_name:name,p_phone:phone,p_email:email,p_party_size:partySize,p_language:String(body?.language||'ko').slice(0,24),p_dietary:String(body?.dietary||'').slice(0,500),p_note:String(body?.note||'').slice(0,2000),p_photo_consent:body?.photoConsent===true,p_privacy_consent:true,p_website:String(body?.website||'').slice(0,200)};
  try{
    const upstream=await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/mission_submit_event_application`,{method:'POST',headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify(rpcBody)});
    const data=await upstream.json().catch(()=>null);
    if(!upstream.ok){const [error,message,status]=missionApplicationError(data?.message||data?.details||'');return json(env,{ok:false,error,message},status);}
    return json(env,{ok:true,eventKey:MISSION_EVENT_SLUG,applicationId:data?.application_id||null,message:'신청이 접수되었습니다.'},200);
  }catch{return json(env,{ok:false,error:'application_unavailable',message:'신청을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.'},503)}
}
async function publicSiteChrome(slug){
  try{const r=await fetch(`https://workspace-api.ekodi.kr/v1/site-chrome/public?subject_key=${encodeURIComponent(slug)}`,{headers:{accept:'application/json'},signal:AbortSignal.timeout(5000)});if(!r.ok)return null;const data=await r.json().catch(()=>null);return data&&typeof data==='object'?data:null}catch{return null}
}
async function publicStorefront(slug,env){
  if(env.DATA_ENABLED!=='true'||!env.SUPABASE_URL||!env.SUPABASE_PUBLISHABLE_KEY)return null;
  try{
    const response=await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/store_public_storefront`,{method:'POST',headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,'content-type':'application/json'},body:JSON.stringify({p_slug:slug})});
    if(!response.ok)return null;
    const data=await response.json().catch(()=>null);
    return data&&typeof data==='object'?data:null;
  }catch{return null}
}
function runtimeConfig(env){
  const dataEnabled=env.DATA_ENABLED==='true'&&Boolean(env.SUPABASE_URL&&env.SUPABASE_PUBLISHABLE_KEY);
  return {dataEnabled,dataMode:env.DATA_MODE||'isolated-staging',supabaseUrl:dataEnabled?env.SUPABASE_URL:'',supabasePublishableKey:dataEnabled?env.SUPABASE_PUBLISHABLE_KEY:'',workspaceApi:dataEnabled?`${env.SUPABASE_URL}/functions/v1/workspace-api`:'',authUrl:env.AUTH_URL||'https://ekodi.kr/auth/?site=space',canonicalOrigin:'https://ekodi.kr',routeModel:['/{slug}','/{slug}/{service}'],memberNamespaceRequired:false,identityModel:'path -> slug(locator) -> workspace_id -> relationship/policy -> role -> capability'};
}
function authRedirect(request,env){
  const current=new URL(request.url);current.hash='';
  const canonical=new URL(current.pathname+current.search,'https://ekodi.kr');
  const target=new URL(env.AUTH_URL||'https://ekodi.kr/auth/?site=space');
  target.searchParams.set('site','space');target.searchParams.set('return_to',canonical.href);
  return withHeaders(env,Response.redirect(target.href,302),'auth-start');
}
async function appShell(request,env,route='space-home',profile=DEFAULT_PAGE_PROFILE){
  const target=new URL(request.url);target.pathname='/';target.search='';target.hash='';
  const asset=await env.ASSETS.fetch(new Request(target.toString(),request));
  const contentType=asset.headers.get('content-type')||'';
  if(!contentType.includes('text/html'))return withHeaders(env,asset,route);
  let html=await asset.text();
  const tokens={
    '__SPACE_PAGE_DOCUMENT_TITLE__':profile.documentTitle,
    '__SPACE_PAGE_NAME__':profile.name,
    '__SPACE_PAGE_KICKER__':profile.kicker,
    '__SPACE_PAGE_LEAD__':profile.lead,
    '__SPACE_PAGE_THEME__':profile.theme,
    '__SPACE_PAGE_DESCRIPTION__':profile.description,
    '__SPACE_PAGE_ROBOTS__':profile.robots||'noindex,nofollow,noarchive',
    '__SPACE_PUBLIC_CLASS__':profile.theme==='yogurt'?'':'hidden',
    '__SPACE_INTERNAL_CLASS__':profile.theme==='yogurt'?'hidden':'',
  };
  for(const [token,value] of Object.entries(tokens))html=html.replaceAll(token,htmlText(value));
  const headers=new Headers(asset.headers);headers.delete('content-length');headers.delete('content-encoding');headers.delete('etag');
  return withHeaders(env,new Response(html,{status:asset.status,statusText:asset.statusText,headers}),route);
}

export default{
  async fetch(request,env){
    const url=new URL(request.url);
    const legacyAlias=url.hostname.toLowerCase()==='space.ekodi.kr';
    const canonicalRedirect=()=>{
      const target=new URL(url.pathname+url.search,'https://ekodi.kr');
      return new Response(null,{status:308,headers:{location:target.toString(),'cache-control':'no-store','x-ekodi-legacy-alias':'space.ekodi.kr'}});
    };
    if(normalizedMissionPath(url.pathname)===MISSION_EVENT_APPLICATION_API)return submitMissionEventApplication(request,env);
    if(['GET','HEAD'].includes(request.method)&&(normalizedMissionPath(url.pathname)===EKODIMISSION_PREFIX||normalizedMissionPath(url.pathname).startsWith(EKODIMISSION_PREFIX+'/')))return routeEkodiMission(request,env);
    if(url.pathname==='/health')return json(env,{ok:true,service:'ekodi-space',product:'operating-space',identity:'ekodi-id',workspaceIdentity:'workspace-id',routeModel:['root-slug','workspace-service'],memberNamespaceRequired:false,dataEnabled:runtimeConfig(env).dataEnabled,dataMode:runtimeConfig(env).dataMode});
    if(url.pathname==='/config.js')return withHeaders(env,new Response(`window.EKODI_SPACE_CONFIG=${JSON.stringify(runtimeConfig(env))};`,{headers:{'content-type':'application/javascript; charset=utf-8','cache-control':'no-store'}}),'config');
    if(url.pathname==='/storefront.json'){
      const slug=String(url.searchParams.get('slug')||'').toLowerCase();
      if(!['jadam','pizzamaru','yogurt'].includes(slug))return json(env,{error:'storefront_not_found'},404);
      const data=await publicStorefront(slug,env);
      return data?json(env,data):json(env,{error:'storefront_unavailable'},503);
    }
    if(url.pathname==='/storefront.css'||url.pathname==='/_ekodi/space/storefront.css')return withHeaders(env,restaurantStorefrontCss(),'storefront-asset');
    if(url.pathname==='/jadam-storefront.css'||url.pathname==='/_ekodi/space/jadam-storefront.css')return withHeaders(env,jadamStorefrontCss(),'storefront-asset');
    if(url.pathname==='/restaurant-storefront.css'||url.pathname==='/_ekodi/space/restaurant-storefront.css')return withHeaders(env,restaurantStorefrontCss(),'storefront-asset');
    if(url.pathname==='/admin'||url.pathname==='/admin/')return Response.redirect('https://admin.ekodi.kr/?route=workspace&source=space.ekodi.kr',307);
    if(url.pathname==='/auth/start'){
      if(!['GET','HEAD'].includes(request.method))return json(env,{error:'method_not_allowed'},405);
      return authRedirect(request,env);
    }
    if(['GET','HEAD'].includes(request.method)&&(url.pathname==='/pizzamaru/mokpodae'||url.pathname==='/pizzamaru/mokpodae/')){
      const target=new URL('/pizzamaru'+url.search,'https://ekodi.kr');
      return new Response(null,{status:308,headers:{location:target.toString(),'cache-control':'no-store','x-ekodi-workspace-alias':'pizzamaru/mokpodae->pizzamaru'}});
    }
    if(url.pathname==='/yogurtpurple'||url.pathname==='/yogurtpurple/'){
      return withHeaders(env,new Response('<!doctype html><html lang="ko"><meta charset="utf-8"><title>삭제된 주소</title><body><main><h1>삭제된 주소입니다.</h1></main></body></html>',{status:410,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}}),'space-gone');
    }
    if(legacyAlias&&(url.pathname==='/'||url.pathname===''||url.pathname==='/index.html'))return new Response(null,{status:308,headers:{location:'https://ekodi.kr/my/','cache-control':'no-store','x-ekodi-legacy-alias':'space.ekodi.kr'}});
    if(url.pathname==='/'||url.pathname===''||url.pathname==='/index.html')return appShell(request,env,'space-home');
    if(isPublicWorkspacePath(url.pathname)){
      const workspaceRoute=workspaceRouteFromPublicPath(url.pathname);
      if(legacyAlias&&url.pathname!=='/deployment-probe')return canonicalRedirect();
      const resolved=await pageProfile(url.pathname,env);
      const requested=workspaceRoute?.slug||workspaceSlugFromPublicPath(url.pathname);
      if(resolved.canonicalSlug&&requested&&resolved.canonicalSlug!==requested){
        const target=new URL(`/${resolved.canonicalSlug}${url.search}`,'https://ekodi.kr');
        return new Response(null,{status:308,headers:{location:target.toString(),'cache-control':'no-store','x-ekodi-workspace-alias':`${requested}->${resolved.canonicalSlug}`}});
      }
      if(resolved.status==='paused')return withHeaders(env,new Response('<!doctype html><html lang="ko"><meta charset="utf-8"><title>사용자 사이트 일시중지 · EKODI</title><body><main><h1>사용자 사이트가 일시중지되었습니다.</h1><p>운영공간 관리자 설정에서 다시 활성화할 수 있습니다.</p></main></body></html>',{status:404,headers:{'content-type':'text/html; charset=utf-8'}}),'space-paused');
      if(isOrganizationWorkspaceSlug(requested)&&!workspaceRoute?.service){
        return withHeaders(env,await renderOrganizationPublicPage(request,env,resolved,requested),'space-organization');
      }
      if(resolved.storefront&&!workspaceRoute?.service){
        resolved.chrome=await publicSiteChrome(requested);
        const storefront=requested==='jadam'
          ?await renderJadamStorefrontPage(request,env,resolved,requested)
          :['pizzamaru','yogurt'].includes(requested)
            ?await renderRestaurantStorefrontPage(request,env,resolved,requested)
            :await renderStorefrontPage(request,env,resolved,requested);
        return withHeaders(env,storefront,'space-storefront');
      }
      return appShell(request,env,workspaceRoute?.service?'space-workspace-service':'space-workspace',resolved.profile);
    }
    return withHeaders(env,await env.ASSETS.fetch(request),'space-asset');
  }
};