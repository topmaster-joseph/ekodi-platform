import { EKODI_SERVICE_MANIFEST } from './ekodi-service-manifest.js';
import { realtimeTenantList } from './realtime-tenant-registry.js';

export const SITE_PUBLICATION_POLICY_ID='EKODI-SITE-PUBLICATION-001';
export const SITE_PUBLICATION_STATUSES=Object.freeze(['public','private','maintenance']);
const STATUS_SET=new Set(SITE_PUBLICATION_STATUSES);
const MANAGE_ROLES=new Set(['platform_admin','tenant_admin','workspace_admin','client_admin','hq_manager','store_owner','owner','admin','senior_pastor','manager']);
const SPECIAL_TENANT_AUTHORITY=Object.freeze({
  mission:{siteKey:'mission',tenantSlug:'ekodimission'},
  biz:{siteKey:'biz',tenantSlug:'ekodibiz'},
  cgma:{siteKey:'cgma',tenantSlug:'cheonggye'},
});
const TENANT_PATH_ALIASES=Object.freeze({
  'ekodi-biz':'/ekodibiz',
  ekodibiz:'/ekodibiz',
  'ekodi-church':'/ekodichurch',
  ekodichurch:'/ekodichurch',
  'ekodi-lab':'/ekodilab',
  ekodilab:'/ekodilab',
  'ekodi-trade':'/ekodibiz/trade',
  ekoditrade:'/ekodibiz/trade',
  'ekodi-cafe':'/cafe',
  cgma:'/cgma',
  cheonggye:'/cheonggye',
  yogurtpurple:'/yogurt',
});
const SPECIAL_SITES=Object.freeze([
  Object.freeze({id:'ekodi',workspaceId:'platform',name:'EKODI',canonicalUrl:'https://ekodi.kr/',canonicalPath:'/',adminUrl:'https://ekodi.kr/admin/',exactRoot:true,authoritySiteKey:'ekodi'}),
  Object.freeze({id:'seonammedi',workspaceId:'seonammedi',name:'서남권 국립의대 소통센터',canonicalUrl:'https://ekodi.kr/seonammedi/',canonicalPath:'/seonammedi',adminUrl:'https://ekodi.kr/seonammedi/admin/',aliases:['seonammedi.kr','www.seonammedi.kr','xn--3e0b8b58jw4co4mnpll3k.kr','www.xn--3e0b8b58jw4co4mnpll3k.kr'],authoritySiteKey:'seonammedi'}),
  Object.freeze({id:'pyeonggongmok',workspaceId:'pyeonggongmok',name:'평생공부하는 목회자 모임',canonicalUrl:'https://ekodi.kr/pyeonggongmok/',canonicalPath:'/pyeonggongmok',adminUrl:'https://ekodi.kr/pyeonggongmok/admin/',authoritySiteKey:'pyeonggongmok'}),
  Object.freeze({id:'cheonggye',workspaceId:'cheonggye',name:'청계잇다',canonicalUrl:'https://ekodi.kr/cheonggye/',canonicalPath:'/cheonggye',adminUrl:'https://ekodi.kr/cheonggye/admin/',authoritySiteKey:'cheonggye'}),
  Object.freeze({id:'cgma',workspaceId:'cgma',name:'청계면상인회',canonicalUrl:'https://ekodi.kr/cgma/',canonicalPath:'/cgma',adminUrl:'https://ekodi.kr/cgma/admin/',aliases:['cgma.or.kr','www.cgma.or.kr'],authoritySiteKey:'cgma',tenantSlug:'cheonggye'}),
]);

const clean=(value,max=2048)=>String(value??'').trim().slice(0,max);
const normalizedId=value=>clean(value,100).toLowerCase().replace(/[^a-z0-9-]/g,'');
const trimPath=value=>{const raw=String(value||'/').split('?')[0].split('#')[0];const path=('/'+raw.replace(/^\/+|\/+$/g,'')).replace(/\/{2,}/g,'/');return path==='/'?'/':path.replace(/\/$/,'')};
const pathForTenant=slug=>TENANT_PATH_ALIASES[clean(slug,100).toLowerCase()]||('/'+clean(slug,100).toLowerCase().replace(/[^a-z0-9-]/g,'-'));
const domainKey=site=>{try{const u=new URL(site.canonicalUrl);return u.hostname+(u.pathname==='/'?'/':u.pathname.replace(/\/$/,''))}catch{return site.canonicalPath||site.id}};
const defaultMaintenanceTitle=site=>site.name?site.name+' 준비 중입니다':'현재 사이트 준비 중입니다';
const defaultMaintenanceMessage='현재 관리자 점검 또는 준비 중입니다. 잠시 후 다시 확인해 주세요.';

function normalizeCatalogSite(site,source='registry'){
  const canonicalUrl=clean(site.canonicalUrl||site.url);
  let url;
  try{url=new URL(canonicalUrl)}catch{return null}
  const canonicalPath=trimPath(site.canonicalPath||url.pathname);
  const id=normalizedId(site.id);
  if(!id)return null;
  const authority=SPECIAL_TENANT_AUTHORITY[id]||{};
  return Object.freeze({
    id,
    workspaceId:clean(site.workspaceId||site.workspace||site.tenantSlug||id,100),
    name:clean(site.name||id,160),
    canonicalUrl:url.toString(),
    url:url.toString(),
    canonicalPath,
    adminUrl:clean(site.adminUrl)||(url.origin+(canonicalPath==='/'?'/admin':canonicalPath+'/admin/')),
    domain:clean(site.domain)||domainKey({canonicalUrl:url.toString(),canonicalPath,id}),
    aliases:Object.freeze([...(site.aliases||[])].map(v=>clean(v,255).toLowerCase()).filter(Boolean)),
    exactRoot:Boolean(site.exactRoot),
    source,
    tenantId:site.tenantId??null,
    tenantSlug:clean(site.tenantSlug||authority.tenantSlug,100),
    authoritySiteKey:normalizedId(site.authoritySiteKey||authority.siteKey||id),
    defaultPublicStatus:'public',
    defaultMaintenanceDisplayType:'default',
    defaultMaintenanceRedirectUrl:'',
    defaultMaintenanceTitle:clean(site.defaultMaintenanceTitle,80)||defaultMaintenanceTitle(site),
    defaultMaintenanceMessage:clean(site.defaultMaintenanceMessage,300)||defaultMaintenanceMessage,
    defaultRedirectMode:'button',
  });
}

function manifestSites(){
  return (EKODI_SERVICE_MANIFEST.services||[])
    .filter(service=>service.defaultSurface==='public'&&service.state!=='planned'&&service.shellIntegration!=='planned')
    .map(service=>{
      let url;try{url=new URL(service.url)}catch{return null}
      return normalizeCatalogSite({
        id:service.id,workspaceId:service.tenantSlug||service.id,name:service.name,
        canonicalUrl:url.toString(),canonicalPath:url.pathname,
        authoritySiteKey:service.id,tenantSlug:service.tenantSlug||'',
      },'service-manifest');
    }).filter(Boolean);
}

function realtimeParentSites(){
  return realtimeTenantList().map(tenant=>normalizeCatalogSite({
    id:tenant.authSite||tenant.apiTenant||tenant.id,
    workspaceId:tenant.workspace||tenant.apiTenant||tenant.id,
    name:tenant.name,
    canonicalUrl:'https://ekodi.kr'+tenant.home,
    canonicalPath:tenant.home,
    authoritySiteKey:tenant.authSite||tenant.apiTenant||tenant.id,
    tenantSlug:tenant.workspace||'',
  },'realtime-parent')).filter(Boolean);
}

function realtimeLiveSites(){
  return realtimeTenantList().map(tenant=>normalizeCatalogSite({
    id:'live-'+String(tenant.apiTenant||tenant.id).toLowerCase(),
    workspaceId:tenant.workspace||tenant.apiTenant||tenant.id,
    name:tenant.name+' Live',
    canonicalUrl:'https://ekodi.kr'+tenant.path,
    canonicalPath:tenant.path,
    adminUrl:'https://ekodi.kr'+tenant.path.replace(/\/$/,'')+'/admin',
    authoritySiteKey:tenant.authSite||tenant.apiTenant||tenant.id,
    tenantSlug:tenant.workspace||'',
    defaultMaintenanceTitle:'라이브 서비스 준비 중입니다',
    defaultMaintenanceMessage:'현재 이 Live 서비스는 관리자 검수 또는 준비 상태입니다.',
  },'realtime-live')).filter(Boolean);
}

export function staticSitePublicationCatalog(){
  const candidates=[
    ...SPECIAL_SITES.map(site=>normalizeCatalogSite(site,'independent-site')),
    ...manifestSites(),
    ...realtimeParentSites(),
    ...realtimeLiveSites(),
  ].filter(Boolean);
  const byPath=new Map(),byId=new Map();
  for(const site of candidates){
    const key=new URL(site.canonicalUrl).hostname+'|'+site.canonicalPath;
    if(byPath.has(key)||byId.has(site.id))continue;
    byPath.set(key,site);byId.set(site.id,site);
  }
  return Object.freeze([...byPath.values()].sort((a,b)=>b.canonicalPath.length-a.canonicalPath.length||a.name.localeCompare(b.name,'ko')));
}

async function activeCustomerTenantSites(env){
  if(!env?.DB?.prepare)return[];
  let result;try{result=await env.DB.prepare("SELECT id,slug,name,domain,status FROM customer_tenants WHERE status='active' ORDER BY name,slug").all()}catch{return[]}
  return (result.results||[]).map(row=>{
    const slug=clean(row.slug,100).toLowerCase();if(!slug)return null;
    const canonicalPath=pathForTenant(slug);
    return normalizeCatalogSite({
      id:slug,workspaceId:slug,name:row.name||slug,canonicalUrl:'https://ekodi.kr'+canonicalPath+'/',
      canonicalPath,adminUrl:'https://ekodi.kr'+canonicalPath+'/admin/',domain:row.domain||'',
      tenantId:row.id,tenantSlug:slug,authoritySiteKey:slug,
    },'customer-tenant');
  }).filter(Boolean);
}

export async function sitePublicationCatalog(env){
  const base=[...staticSitePublicationCatalog()];
  const dynamic=await activeCustomerTenantSites(env);
  const paths=new Set(base.map(site=>new URL(site.canonicalUrl).hostname+'|'+site.canonicalPath));
  const ids=new Set(base.map(site=>site.id));
  for(const site of dynamic){
    const key=new URL(site.canonicalUrl).hostname+'|'+site.canonicalPath;
    if(paths.has(key)||ids.has(site.id))continue;
    base.push(site);paths.add(key);ids.add(site.id);
  }
  return base.sort((a,b)=>b.canonicalPath.length-a.canonicalPath.length||a.name.localeCompare(b.name,'ko'));
}

export async function ensureSitePublicationRows(env){
  if(!env?.DB?.prepare)return[];
  const catalog=await sitePublicationCatalog(env),now=new Date().toISOString();
  const seed=env.DB.prepare(`INSERT OR IGNORE INTO public_site_controls
    (site_id,workspace_id,domain,public_status,maintenance_display_type,maintenance_redirect_url,maintenance_title,maintenance_message,redirect_mode,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`);
  if(catalog.length)await env.DB.batch(catalog.map(site=>seed.bind(
    site.id,site.workspaceId,site.domain,'public','default','',site.defaultMaintenanceTitle,site.defaultMaintenanceMessage,'button',now
  )));
  return catalog;
}

export function normalizeSitePublicationRow(row,site){
  return Object.freeze({
    ...site,
    publicStatus:STATUS_SET.has(row?.public_status)?row.public_status:'public',
    maintenanceDisplayType:row?.maintenance_display_type==='url'?'url':'default',
    maintenanceRedirectUrl:clean(row?.maintenance_redirect_url),
    maintenanceTitle:clean(row?.maintenance_title,80)||site.defaultMaintenanceTitle,
    maintenanceMessage:clean(row?.maintenance_message,300)||site.defaultMaintenanceMessage,
    redirectMode:row?.redirect_mode==='auto'?'auto':'button',
    updatedAt:row?.updated_at||'',
    updatedBy:row?.updated_by??null,
  });
}

export async function listSitePublicationSettings(env){
  const catalog=await ensureSitePublicationRows(env);
  if(!env?.DB?.prepare)return catalog.map(site=>normalizeSitePublicationRow(null,site));
  let result;try{result=await env.DB.prepare('SELECT * FROM public_site_controls').all()}catch{return catalog.map(site=>normalizeSitePublicationRow(null,site))}
  const rows=new Map((result.results||[]).map(row=>[String(row.site_id),row]));
  return catalog.map(site=>normalizeSitePublicationRow(rows.get(site.id),site));
}

export async function getSitePublicationSetting(env,siteId){
  const id=normalizedId(siteId);if(!id)return null;
  let site=staticSitePublicationCatalog().find(item=>item.id===id);
  if(!site){
    const dynamic=await activeCustomerTenantSites(env);
    site=dynamic.find(item=>item.id===id)||null;
  }
  if(!site)return null;
  if(!env?.DB?.prepare)return normalizeSitePublicationRow(null,site);
  let row;try{row=await env.DB.prepare('SELECT * FROM public_site_controls WHERE site_id=? LIMIT 1').bind(id).first()}catch{return normalizeSitePublicationRow(null,site)}
  if(!row){
    const now=new Date().toISOString();
    try{
      await env.DB.prepare(`INSERT OR IGNORE INTO public_site_controls
        (site_id,workspace_id,domain,public_status,maintenance_display_type,maintenance_redirect_url,maintenance_title,maintenance_message,redirect_mode,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(site.id,site.workspaceId,site.domain,'public','default','',site.defaultMaintenanceTitle,site.defaultMaintenanceMessage,'button',now).run();
      row=await env.DB.prepare('SELECT * FROM public_site_controls WHERE site_id=? LIMIT 1').bind(id).first();
    }catch{return normalizeSitePublicationRow(null,site)}
  }
  return normalizeSitePublicationRow(row,site);
}

function validRedirect(value){
  const raw=clean(value);if(!raw)return'';
  try{const url=new URL(raw);return ['https:','http:'].includes(url.protocol)?url.toString():''}catch{return''}
}

export async function putSitePublicationSetting(env,siteId,input={},updatedBy=null){
  const current=await getSitePublicationSetting(env,siteId);if(!current)return{ok:false,status:404,error:'site_not_found'};
  const status=clean(input.publicStatus||current.publicStatus,20).toLowerCase();
  if(!STATUS_SET.has(status))return{ok:false,status:400,error:'invalid_publication_status'};
  const displayType=input.maintenanceDisplayType==null?current.maintenanceDisplayType:(input.maintenanceDisplayType==='url'?'url':'default');
  const redirectMode=input.redirectMode==null?current.redirectMode:(input.redirectMode==='auto'?'auto':'button');
  const redirectUrl=validRedirect(input.maintenanceRedirectUrl??current.maintenanceRedirectUrl);
  if(status==='maintenance'&&displayType==='url'&&!redirectUrl)return{ok:false,status:400,error:'maintenance_redirect_required'};
  const title=clean(input.maintenanceTitle??current.maintenanceTitle,80)||current.defaultMaintenanceTitle;
  const message=clean(input.maintenanceMessage??current.maintenanceMessage,300)||current.defaultMaintenanceMessage;
  const now=new Date().toISOString();
  await env.DB.prepare(`UPDATE public_site_controls SET public_status=?,maintenance_display_type=?,maintenance_redirect_url=?,maintenance_title=?,maintenance_message=?,redirect_mode=?,updated_at=?,updated_by=? WHERE site_id=?`)
    .bind(status,displayType,redirectUrl,title,message,redirectMode,now,Number.isInteger(updatedBy)?updatedBy:null,current.id).run();
  return{ok:true,status:200,site:await getSitePublicationSetting(env,current.id)};
}

function requestHost(request){return new URL(request.url).hostname.toLowerCase()}
function relativePath(path,base){
  if(base==='/')return path;
  if(path===base)return'/';
  return path.startsWith(base+'/')?path.slice(base.length):'';
}
function adminOrProtectedRelative(relative){
  const rel=trimPath(relative||'/').toLowerCase();
  return rel==='/admin'||rel.startsWith('/admin/')||rel==='/api'||rel.startsWith('/api/')||rel==='/auth'||rel.startsWith('/auth/')||rel==='/health'||rel.startsWith('/health/');
}
function pageLike(pathname){
  const path=String(pathname||'/');if(path.endsWith('/'))return true;
  const last=path.split('/').filter(Boolean).pop()||'';
  if(!last.includes('.'))return true;
  return /\.html?$/i.test(last);
}
function hostMatches(site,host){
  let canonicalHost='';try{canonicalHost=new URL(site.canonicalUrl).hostname.toLowerCase()}catch{}
  const storedDomain=clean(site.domain,255).toLowerCase().split('/')[0];
  return host===canonicalHost||site.aliases.includes(host)||(storedDomain&&storedDomain===host);
}

async function tenantSiteForFirstSegment(env,path){
  if(!env?.DB?.prepare)return null;
  const segment=String(path||'').split('/').filter(Boolean)[0]||'';if(!segment)return null;
  let row;try{row=await env.DB.prepare("SELECT id,slug,name,domain,status FROM customer_tenants WHERE status='active' AND lower(slug)=? LIMIT 1").bind(segment.toLowerCase()).first()}catch{return null}
  if(!row)return null;
  return normalizeCatalogSite({id:row.slug,workspaceId:row.slug,name:row.name,canonicalUrl:'https://ekodi.kr'+pathForTenant(row.slug)+'/',canonicalPath:pathForTenant(row.slug),tenantId:row.id,tenantSlug:row.slug,authoritySiteKey:row.slug,domain:row.domain||''},'customer-tenant');
}

async function tenantSiteForDomain(env,host){
  if(!env?.DB?.prepare||!host)return null;
  let rows;try{rows=await env.DB.prepare("SELECT id,slug,name,domain,status FROM customer_tenants WHERE status='active' AND domain IS NOT NULL AND trim(domain)<>''").all()}catch{return null}
  const row=(rows.results||[]).find(item=>String(item.domain||'').trim().toLowerCase().replace(/^https?:\/\//,'').split('/')[0]===host);
  if(!row)return null;
  const canonicalPath=pathForTenant(row.slug);
  return normalizeCatalogSite({id:row.slug,workspaceId:row.slug,name:row.name,canonicalUrl:'https://ekodi.kr'+canonicalPath+'/',canonicalPath,tenantId:row.id,tenantSlug:row.slug,authoritySiteKey:row.slug,domain:row.domain||''},'customer-tenant');
}

export async function resolvePublicationSiteForRequest(request,env,{admin=false}={}){
  const url=new URL(request.url),host=requestHost(request),path=trimPath(url.pathname);
  const matches=site=>{
    if(site.exactRoot)return host==='ekodi.kr'&&path==='/';
    if(hostMatches(site,host)&&host!=='ekodi.kr')return true;
    if(host!=='ekodi.kr')return false;
    return path===site.canonicalPath||path.startsWith(site.canonicalPath+'/');
  };
  let candidates=staticSitePublicationCatalog().filter(matches).sort((a,b)=>b.canonicalPath.length-a.canonicalPath.length);
  if(!candidates.length){
    const dynamic=host==='ekodi.kr'?await tenantSiteForFirstSegment(env,path):await tenantSiteForDomain(env,host);
    if(dynamic&&matches(dynamic))candidates=[dynamic];
  }
  const site=candidates[0];if(!site)return null;
  const relative=host==='ekodi.kr'?relativePath(path,site.canonicalPath):path;
  const isAdmin=adminOrProtectedRelative(relative)&&(/^\/admin(?:\/|$)/i.test(relative));
  if(admin)return isAdmin?site:null;
  if(isAdmin||adminOrProtectedRelative(relative)||!pageLike(path))return null;
  return site;
}

function publicationHeaders(status){
  const headers=new Headers({'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'strict-origin-when-cross-origin','x-ekodi-site-publication':status});
  if(status!=='public')headers.set('x-robots-tag','noindex, nofollow, noarchive');
  return headers;
}
function esc(value){return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}
function statusPage(site,status){
  const privateMode=status==='private';
  const title=privateMode?'현재 비공개 사이트입니다':site.maintenanceTitle;
  const message=privateMode?'관리자가 공개 전환하기 전까지 일반 방문자에게 표시되지 않습니다.':site.maintenanceMessage;
  const redirect=validRedirect(site.maintenanceRedirectUrl);
  const button=!privateMode&&site.maintenanceDisplayType==='url'&&redirect&&site.redirectMode!=='auto'?'<a href="'+esc(redirect)+'" rel="noopener noreferrer">안내 페이지 보기</a>':'';
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>${esc(title)}</title><style>:root{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Noto Sans KR","Segoe UI",sans-serif;color:#172033;background:#f3f6fa}*{box-sizing:border-box}body{margin:0;min-height:100dvh;display:grid;place-items:center;padding:20px}main{width:min(100%,560px);padding:34px 26px;border:1px solid #dbe3ed;border-radius:22px;background:#fff;box-shadow:0 18px 55px rgba(35,55,80,.1);text-align:center}.eyebrow{font-size:12px;font-weight:850;letter-spacing:.08em;color:#64748b}h1{margin:13px 0 10px;font-size:clamp(26px,6vw,38px);letter-spacing:-.04em}p{margin:0;color:#5b687a;line-height:1.65;word-break:keep-all}a{display:inline-flex;margin-top:20px;padding:11px 15px;border-radius:11px;background:#173b63;color:#fff;text-decoration:none;font-weight:800}small{display:block;margin-top:22px;color:#8a96a6}</style></head><body><main><div class="eyebrow">EKODI · SITE STATUS</div><h1>${esc(title)}</h1><p>${esc(message)}</p>${button}<small>${esc(site.name)}</small></main></body></html>`;
}

export async function sitePublicationGuard(request,env){
  if(!['GET','HEAD'].includes(request.method))return null;
  const site=await resolvePublicationSiteForRequest(request,env);if(!site)return null;
  let setting;try{setting=await getSitePublicationSetting(env,site.id)}catch(error){console.error('site publication read failed',error);return null}
  if(!setting||setting.publicStatus==='public')return null;
  if(setting.publicStatus==='maintenance'&&setting.maintenanceDisplayType==='url'&&setting.redirectMode==='auto'){
    const target=validRedirect(setting.maintenanceRedirectUrl);if(target)return new Response(null,{status:302,headers:{location:target,'cache-control':'no-store','x-robots-tag':'noindex, nofollow, noarchive','x-ekodi-site-publication':'maintenance'}});
  }
  const status=setting.publicStatus==='private'?'private':'maintenance';
  return new Response(request.method==='HEAD'?null:statusPage(setting,status),{status:status==='private'?404:200,headers:publicationHeaders(status)});
}

function bearer(request){const raw=clean(request.headers.get('authorization'),8192);return raw.toLowerCase().startsWith('bearer ')?raw.slice(7).trim():''}
async function supabaseIdentity(request,env){
  const token=bearer(request),base=clean(env?.MY_SUPABASE_URL||env?.SUPABASE_URL).replace(/\/$/,'');
  const key=clean(env?.MY_SUPABASE_PUBLISHABLE_KEY||env?.SUPABASE_PUBLISHABLE_KEY);
  if(!token||!base||!key)return null;
  const response=await fetch(base+'/auth/v1/user',{headers:{apikey:key,authorization:'Bearer '+token},signal:AbortSignal.timeout(10000)}).catch(()=>null);
  if(!response?.ok)return null;const user=await response.json().catch(()=>null);
  return user?.id&&user?.email_confirmed_at?{id:String(user.id),email:clean(user.email,254).toLowerCase(),token,base,key}:null;
}
async function customerTenantForSite(env,site){
  if(site.tenantId)return{id:site.tenantId,slug:site.tenantSlug||site.id};
  if(!env?.DB?.prepare)return null;
  let rows;try{rows=await env.DB.prepare("SELECT id,slug,name,domain,status FROM customer_tenants WHERE status='active'").all()}catch{return null}
  return (rows.results||[]).find(row=>pathForTenant(row.slug)===site.canonicalPath||String(row.slug).toLowerCase()===site.tenantSlug||String(row.slug).toLowerCase()===site.id)||null;
}
async function accessApiAllows(who,env,site){
  const authority=SPECIAL_TENANT_AUTHORITY[site.id]||{};
  const siteKey=authority.siteKey||site.authoritySiteKey||site.id;
  const tenant=authority.tenantSlug||site.tenantSlug||'';
  const endpoint=tenant?'reviewer':'me';
  const url=new URL(who.base+'/functions/v1/access-api/'+endpoint);url.searchParams.set('site',siteKey);if(tenant)url.searchParams.set('tenant',tenant);
  const response=await fetch(url,{headers:{authorization:'Bearer '+who.token,apikey:who.key,accept:'application/json'},signal:AbortSignal.timeout(10000)}).catch(()=>null);
  const data=await response?.json().catch(()=>({}))||{};
  if(tenant)return Boolean(response?.ok&&data.allowed===true&&MANAGE_ROLES.has(String(data.role||'tenant_admin').toLowerCase()));
  return Boolean(response?.ok&&data.authenticated===true&&['active','pre_registered'].includes(String(data.status||''))&&MANAGE_ROLES.has(String(data.role||'').toLowerCase()));
}
async function d1GrantAllows(env,who,site){
  const tenant=await customerTenantForSite(env,site);if(!tenant||!env?.DB?.prepare)return false;
  let grant;try{grant=await env.DB.prepare('SELECT role,enabled FROM customer_access_grants WHERE tenant_id=? AND lower(trim(email))=?').bind(tenant.id,who.email).first()}catch{return false}
  return Boolean(grant&&Number(grant.enabled)===1&&MANAGE_ROLES.has(String(grant.role||'').toLowerCase()));
}

export async function sitePublicationAuthority(request,env,site,{platformSessionCheck}={}){
  if(typeof platformSessionCheck==='function'){
    const platform=await platformSessionCheck(request,env).catch(()=>null);
    if(platform?.session?.authenticated!==false&&platform?.session?.role==='super_admin')return{ok:true,scope:'platform',role:'super_admin',actor:platform.session.email||'super_admin',platformSession:platform.session};
  }
  const who=await supabaseIdentity(request,env);if(!who)return{ok:false,status:401,error:'login_required'};
  if(await d1GrantAllows(env,who,site)||await accessApiAllows(who,env,site))return{ok:true,scope:'site',role:'site_admin',actor:who.email};
  return{ok:false,status:403,error:'site_admin_required'};
}

function siteApiHeaders(request){
  const headers=new Headers({'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','vary':'Origin'});
  const origin=clean(request.headers.get('origin'),500);try{const u=new URL(origin);if(u.protocol==='https:'&&u.hostname==='ekodi.kr')headers.set('access-control-allow-origin',origin)}catch{}
  headers.set('access-control-allow-methods','GET,PUT,OPTIONS');headers.set('access-control-allow-headers','authorization,content-type');return headers;
}
const siteApiJson=(request,data,status=200)=>new Response(JSON.stringify(data),{status,headers:siteApiHeaders(request)});

export async function handleSitePublicationApi(request,env,{platformSessionCheck,onAudit}={}){
  const url=new URL(request.url);if(url.pathname!=='/api/site-publication')return null;
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:siteApiHeaders(request)});
  const siteId=normalizedId(url.searchParams.get('site'));if(!siteId)return siteApiJson(request,{error:'site_required'},400);
  const site=await getSitePublicationSetting(env,siteId);if(!site)return siteApiJson(request,{error:'site_not_found'},404);
  const authority=await sitePublicationAuthority(request,env,site,{platformSessionCheck});
  if(!authority.ok)return siteApiJson(request,{error:authority.error},authority.status||403);
  if(request.method==='GET')return siteApiJson(request,{site,authority:{scope:authority.scope,role:authority.role}});
  if(request.method==='PUT'){
    const body=await request.json().catch(()=>null);if(!body||typeof body!=='object')return siteApiJson(request,{error:'invalid_json'},400);
    const result=await putSitePublicationSetting(env,siteId,body,null);
    if(!result.ok)return siteApiJson(request,{error:result.error},result.status||400);
    if(typeof onAudit==='function')await onAudit({site:result.site,authority,body}).catch(()=>{});
    return siteApiJson(request,{site:result.site,authority:{scope:authority.scope,role:authority.role}});
  }
  return siteApiJson(request,{error:'method_not_allowed'},405);
}

const ADMIN_JS=`(()=>{'use strict';const script=document.currentScript||document.querySelector('script[data-ekodi-site-publication-admin]');const site=script?.dataset?.siteId||'';if(!site||document.querySelector('[data-ekodi-site-publication-control]'))return;function token(){try{const direct=sessionStorage.getItem('ekodi-auth-token');if(direct)return direct;for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i)||'';if(!/^sb-.*-auth-token$/.test(k))continue;try{const v=JSON.parse(localStorage.getItem(k)||'null');const t=v?.access_token||v?.currentSession?.access_token||v?.session?.access_token;if(t)return t}catch{}}}catch{}return''}function n(tag,text,cls){const e=document.createElement(tag);if(text)e.textContent=text;if(cls)e.className=cls;return e}const bar=n('section','','ekodi-site-publication-control');bar.dataset.ekodiSitePublicationControl='v1';const copy=n('div');copy.append(n('strong','사이트 공개'),n('small','공개 · 비공개 · 점검화면'));const select=n('select');select.setAttribute('aria-label','사이트 공개 상태');[['public','공개'],['private','비공개'],['maintenance','점검화면']].forEach(([v,l])=>{const o=n('option',l);o.value=v;select.append(o)});const save=n('button','저장');save.type='button';const state=n('span','불러오는 중…','ekodi-site-publication-state');bar.append(copy,select,save,state);const slot=document.querySelector('[data-ekodi-site-publication-slot]');if(slot){bar.classList.add('ekodi-site-publication-inline');slot.append(bar)}else{const target=document.querySelector('main,[role="main"],.content,#main')||document.body;target.prepend(bar)}async function req(method='GET',body){const headers={accept:'application/json'},t=token();if(t)headers.authorization='Bearer '+t;if(body)headers['content-type']='application/json';const r=await fetch('https://ekodi.kr/api/site-publication?site='+encodeURIComponent(site),{method,headers,body:body?JSON.stringify(body):undefined,credentials:'omit',cache:'no-store'});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'publication_'+r.status);return d}async function load(){try{const d=await req();select.value=d.site.publicStatus||'public';state.textContent=d.authority?.scope==='platform'?'최고관리자 권한':'이 사이트 관리자 권한'}catch(e){select.disabled=true;save.disabled=true;state.textContent=e.message==='login_required'?'로그인 후 변경할 수 있습니다.':'권한 확인 필요'}}async function persist(){save.disabled=true;select.disabled=true;state.textContent='저장 중…';try{const d=await req('PUT',{publicStatus:select.value});select.value=d.site.publicStatus;state.textContent='저장했습니다.'}catch(e){state.textContent='저장 실패: '+e.message}finally{save.disabled=false;select.disabled=false}}save.onclick=persist;if(slot)select.onchange=persist;load()})();`;
const ADMIN_CSS=`.ekodi-site-publication-control{display:grid;grid-template-columns:minmax(170px,1fr) minmax(130px,180px) auto minmax(120px,auto);gap:8px;align-items:center;margin:0 0 12px;padding:10px 12px;border:1px solid #dce3ec;border-radius:11px;background:#fff;color:#27364a;box-shadow:0 2px 8px rgba(35,55,80,.04)}.ekodi-site-publication-control>div{display:grid;gap:2px}.ekodi-site-publication-control strong{font-size:13px}.ekodi-site-publication-control small,.ekodi-site-publication-state{font-size:11px;color:#718096}.ekodi-site-publication-control select,.ekodi-site-publication-control button{min-height:36px;border:1px solid #d7e0ea;border-radius:8px;background:#fff;color:#27364a;padding:6px 9px;font:inherit}.ekodi-site-publication-control button{font-weight:800;cursor:pointer}.ekodi-site-publication-control button:disabled{opacity:.55;cursor:wait}@media(max-width:700px){.ekodi-site-publication-control{grid-template-columns:1fr auto}.ekodi-site-publication-control>div{grid-column:1/-1}.ekodi-site-publication-state{grid-column:1/-1}}.ekodi-site-publication-inline{display:block!important;margin:0!important;padding:0!important;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important}.ekodi-site-publication-inline>div,.ekodi-site-publication-inline>button,.ekodi-site-publication-inline>.ekodi-site-publication-state{display:none!important}.ekodi-site-publication-inline select{width:100%;min-width:0!important;min-height:34px!important;height:34px!important;padding:4px 24px 4px 8px!important;border-radius:8px!important;font-size:11px!important;font-weight:800!important;color:#1f4f7a!important;background:#f5f9fd!important;border-color:#cfdce8!important;cursor:pointer}.ekodi-site-publication-inline select:disabled{opacity:.65;cursor:wait}`;

export function sitePublicationAdminAsset(request){
  const path=new URL(request.url).pathname;
  if(path==='/site-publication-admin.js')return new Response(ADMIN_JS,{headers:{'content-type':'application/javascript; charset=utf-8','cache-control':'public, max-age=300','x-content-type-options':'nosniff'}});
  if(path==='/site-publication-admin.css')return new Response(ADMIN_CSS,{headers:{'content-type':'text/css; charset=utf-8','cache-control':'public, max-age=300','x-content-type-options':'nosniff'}});
  return null;
}
class PublicationAdminHeadInjector{constructor(site){this.site=site}element(element){element.append(`<link rel="stylesheet" href="/site-publication-admin.css" data-ekodi-site-publication-admin-style><script src="/site-publication-admin.js" defer data-ekodi-site-publication-admin data-site-id="${esc(this.site.id)}"></script>`,{html:true})}}
export function injectSitePublicationAdmin(response,site){
  if(!response||!site||typeof HTMLRewriter!=='function')return response;
  if(!String(response.headers.get('content-type')||'').toLowerCase().includes('text/html'))return response;
  const headers=new Headers(response.headers);headers.set('cache-control','no-store');headers.set('x-ekodi-site-publication-admin',site.id);
  return new HTMLRewriter().on('head',new PublicationAdminHeadInjector(site)).transform(new Response(response.body,{status:response.status,statusText:response.statusText,headers}));
}
