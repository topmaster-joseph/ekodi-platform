import { SITE_MEMBER_HOME_FOUNDATION, foundationForAudience } from './generated/site-member-home-foundation.js';
import { isWorkspaceSlug } from './workspace-route-policy.js';

const ASSET_PREFIX='/_ekodi/member-home/';
const MEMBER_HOME_JS=`${ASSET_PREFIX}site-member-home.js`;
const MEMBER_HOME_CSS=`${ASSET_PREFIX}site-member-home.css`;

function esc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function cleanPath(value){const path=String(value||'/').split('?')[0].split('#')[0];return ('/'+path.replace(/^\/+|\/+$/g,'')).replace(/\/$/,'')||'/';}
function serviceCanonicalPath(service){
  try{
    const url=new URL(service.url);
    const path=cleanPath(url.pathname);
    return url.hostname==='ekodi.kr'&&path!=='/'?path:`/${service.id}`;
  }catch{return `/${service.id}`}
}
function serviceHomeUrl(service){
  try{return new URL(service.url).toString()}catch{return `https://ekodi.kr/${encodeURIComponent(service.id)}`}
}
function serviceMemberRoutes(){
  const rows=[];
  for(const service of SITE_MEMBER_HOME_FOUNDATION.services||[]){
    if(service.id==='my')continue;
    const canonical=serviceCanonicalPath(service);
    rows.push({path:`${canonical}/my`,service,canonical:true});
    const alias=`/${service.id}/my`;
    if(alias!==`${canonical}/my`)rows.push({path:alias,service,canonical:false});
  }
  return rows.sort((a,b)=>b.path.length-a.path.length);
}
const SERVICE_MEMBER_ROUTES=serviceMemberRoutes();

export function memberHomeRouteFromPath(pathname){
  const path=cleanPath(pathname);
  if(path==='/my')return null;
  for(const row of SERVICE_MEMBER_ROUTES){
    if(path===row.path){
      const memberHome=`https://ekodi.kr${row.path}`;
      return Object.freeze({
        kind:'service',
        siteKey:row.service.id,
        serviceId:row.service.id,
        displayName:row.service.name||row.service.id,
        memberHomePath:row.path,
        memberHome,
        siteHome:serviceHomeUrl(row.service),
        audience:'person',
        canonical:row.canonical,
        group:row.service.group||'',
      });
    }
  }
  const match=path.match(/^\/([^/]+)\/my$/);
  const slug=match?.[1]?.toLowerCase()||'';
  if(!slug||!isWorkspaceSlug(slug))return null;
  return Object.freeze({
    kind:'workspace',
    siteKey:slug,
    serviceId:'space',
    displayName:slug,
    memberHomePath:`/${slug}/my`,
    memberHome:`https://ekodi.kr/${slug}/my`,
    siteHome:`https://ekodi.kr/${slug}`,
    workspaceSlug:slug,
    audience:'organization',
    canonical:true,
    group:'workspace',
  });
}

export function canonicalMemberHomeForService(serviceId){
  const id=String(serviceId||'').trim().toLowerCase();
  if(!id||id==='my'||id==='ekodi')return 'https://ekodi.kr/my/';
  const service=(SITE_MEMBER_HOME_FOUNDATION.services||[]).find(item=>item.id===id);
  if(!service)return `https://ekodi.kr/${encodeURIComponent(id)}/my`;
  return `https://ekodi.kr${serviceCanonicalPath(service)}/my`;
}

function loginUrl(route){
  const url=new URL('https://ekodi.kr/auth/');
  url.searchParams.set('site',route.kind==='workspace'?'space':route.serviceId);
  url.searchParams.set('return_to',route.memberHome);
  url.searchParams.set('direct','1');
  return url.toString();
}
function safeReturn(raw,route){
  if(!raw)return route.siteHome;
  try{
    const url=new URL(raw,'https://ekodi.kr');
    if(url.protocol!=='https:'||url.hostname!=='ekodi.kr')return route.siteHome;
    return url.toString();
  }catch{return route.siteHome}
}
export function siteMemberHomePage(request,route){
  const url=new URL(request.url);
  const back=safeReturn(url.searchParams.get('return_to'),route);
  const title=`${route.displayName} · 마이페이지`;
  const html=`<!doctype html><html lang="ko" data-site-member-home="v1" data-site-key="${esc(route.siteKey)}" data-service-id="${esc(route.serviceId)}" data-workspace-slug="${esc(route.workspaceSlug||'')}" data-audience-hint="${esc(route.audience)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow,noarchive"><meta name="google" content="notranslate"><title>${esc(title)}</title><link rel="stylesheet" href="${MEMBER_HOME_CSS}"></head><body><header class="smh-top"><div class="smh-wrap smh-top-inner"><a class="smh-brand" href="${esc(route.siteHome)}">${esc(route.displayName)}</a><nav><a href="${esc(back)}">사이트로</a><a href="https://ekodi.kr/my/">전체 개인 홈</a></nav></div></header><main class="smh-wrap"><section class="smh-hero"><span>MY PAGE · ${route.kind==='workspace'?'SITE':'SERVICE'}</span><h1>${esc(route.displayName)} 마이페이지</h1><p>이 사이트에서 필요한 핵심·공통·전문 기능을 한곳에 모으고, 로그인한 사용자별로 표시 순서와 자주 쓰는 서비스를 맞춤 구성합니다.</p><div id="memberState" class="smh-state">로그인 상태를 확인하고 있습니다.</div><a id="loginAction" class="smh-primary" href="${esc(loginUrl(route))}" hidden>Google로 로그인</a></section><section id="workspaceContext" class="smh-context" hidden><small>현재 공간</small><strong id="workspaceName">${esc(route.displayName)}</strong><span id="workspaceRole"></span></section><section class="smh-layer"><div class="smh-head"><div><small>CORE</small><h2>핵심서비스</h2></div><p>모든 사용자 공간에 기본으로 연결되는 공통 기반입니다.</p></div><div id="coreGrid" class="smh-grid"></div></section><section class="smh-layer"><div class="smh-head"><div><small>COMMON</small><h2>공통서비스</h2></div><p>필요할 때 바로 쓰되 권한과 데이터는 각 사이트 경계 안에서 유지합니다.</p></div><div id="commonGrid" class="smh-grid"></div></section><section class="smh-layer"><div class="smh-head"><div><small>SPECIALIST</small><h2>전문서비스</h2></div><p>개인·사업·기관·단체의 성격에 맞는 전문 Workspace Pack을 최신 Registry에서 자동 구성합니다.</p></div><div id="specialistGrid" class="smh-grid"></div></section><section class="smh-layer smh-custom"><div class="smh-head"><div><small>PERSONALIZE</small><h2>서비스 맞춤 설정</h2></div><p>고정·숨김 설정은 표시만 바꾸며 서비스 권한을 부여하거나 제거하지 않습니다.</p></div><div id="serviceGrid" class="smh-services"></div><div class="smh-actions"><button id="restoreServices" type="button">숨김·순서 초기화</button><span id="saveState"></span></div></section></main><footer><div class="smh-wrap"><span>사이트별 마이페이지 · 최신 Registry 실시간 투영</span><span>개인정보·권한은 원본 Workspace 경계를 유지합니다.</span></div></footer><script src="${MEMBER_HOME_JS}" defer></script></body></html>`;
  const headers=new Headers({
    'content-type':'text/html; charset=utf-8',
    'cache-control':'no-store',
    'x-content-type-options':'nosniff',
    'x-frame-options':'DENY',
    'referrer-policy':'no-referrer',
    'x-robots-tag':'noindex, nofollow, noarchive',
    'permissions-policy':'camera=(), microphone=(), geolocation=(), usb=()',
    'content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' https://renzehysxirjilvdxacv.supabase.co; img-src 'self' data: https:; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://ekodi.kr; object-src 'none'; upgrade-insecure-requests",
    'x-ekodi-route':'site-member-home',
    'x-ekodi-member-home':'site-local-v1',
  });
  return new Response(request.method==='HEAD'?null:html,{status:200,headers});
}

function serviceProjection(){
  return (SITE_MEMBER_HOME_FOUNDATION.services||[]).map(service=>({
    id:service.id,
    name:service.name,
    nameEn:service.nameEn||'',
    url:service.url,
    group:service.group||'',
    status:service.status||'planned',
    available:service.available===true,
    productionVerified:service.productionVerified===true,
  }));
}
export function siteMemberFoundationResponse(request){
  const url=new URL(request.url);
  const audience=String(url.searchParams.get('audience')||'person').trim().toLowerCase();
  const foundation=foundationForAudience(audience);
  return new Response(JSON.stringify({
    ok:true,
    version:`${foundation.policyId}:${foundation.capabilityRegistryVersion}:${foundation.workspacePackVersion}:${foundation.ecosystemServiceRegistryVersion||''}`,
    audience,
    core:foundation.core,
    common:foundation.common,
    specialist:foundation.specialist,
    services:serviceProjection(),
    policy:{customization:foundation.customization,privacy:foundation.privacy,projection:'registry-live',futureRegistryChangesApplyAutomatically:true},
  }),{headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','x-ekodi-route':'site-member-home-foundation'}});
}

export { ASSET_PREFIX, MEMBER_HOME_JS, MEMBER_HOME_CSS };
