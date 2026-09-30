import { siteChromeDefaults } from './config/site-chrome-defaults.js';

const SUPABASE_URL='https://renzehysxirjilvdxacv.supabase.co';
const SUPABASE_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const MANAGE_ROLES=new Set(['store_owner','hq_manager','client_admin','manager','owner','tenant_admin','workspace_admin','senior_pastor']);
const SUBJECT_ALIASES=Object.freeze({
  ekodibiz:'ekodi-biz',
  ekodichurch:'ekodi-church',
  ekodilab:'ekodi-lab',
  cheonggye:'cgma',
  'cheonggye-merchants':'cgma',
  'cheonggye-merchant-association':'cgma',
  yogurtpurple:'yogurt',
});
const CANONICAL_PATHS=Object.freeze({
  'ekodi-biz':'/ekodibiz',
  'ekodi-church':'/ekodichurch',
  'ekodi-lab':'/ekodilab',
  'ekodi-trade':'/ekodibiz/trade',
  'ekodi-cafe':'/cafe',
  cgma:'/cgma',
});
const clean=(value,max=240)=>String(value??'').trim().slice(0,max);
const nowIso=()=>new Date().toISOString();
function parse(value,fallback={}){try{return JSON.parse(value||'')}catch{return fallback}}
export function canonicalSiteSubject(value=''){
  const raw=clean(value,80).toLowerCase();
  return SUBJECT_ALIASES[raw]||raw;
}
function canonicalPath(slug=''){
  const key=canonicalSiteSubject(slug);
  return CANONICAL_PATHS[key]||`/${key}`;
}
function canonicalUrl(slug=''){return `https://ekodi.kr${canonicalPath(slug)}`}
function siteName(tenant){return canonicalSiteSubject(tenant?.slug)==='cgma'?'청계면상인회':clean(tenant?.name,160)||canonicalSiteSubject(tenant?.slug)}
function siteAbbreviation(tenant){return canonicalSiteSubject(tenant?.slug)==='cgma'?'CGMA':''}
function safeHref(value,{mail=false}={}){
  const raw=clean(value,2048);if(!raw)return'';
  if(raw.startsWith('/')&&!raw.startsWith('//'))return raw;
  try{const url=new URL(raw);if(['https:','http:'].includes(url.protocol))return url.href;if(mail&&url.protocol==='mailto:')return raw}catch{}
  return'';
}
function normalizeHeader(value,tenant){
  const defaults=siteChromeDefaults(siteName(tenant),canonicalUrl(tenant.slug)).header;
  const input=value&&typeof value==='object'?value:{};
  return {
    siteName:clean(input.siteName,120)||defaults.siteName,
    tagline:clean(input.tagline,180),
    homeLabel:clean(input.homeLabel,40)||defaults.homeLabel,
    homeUrl:safeHref(input.homeUrl)||defaults.homeUrl,
  };
}
function normalizeFooter(value,tenant){
  const defaults=siteChromeDefaults(siteName(tenant),canonicalUrl(tenant.slug)).footer;
  const input=value&&typeof value==='object'?value:{};
  const operator=input.operator&&typeof input.operator==='object'?input.operator:{};
  const contact=input.contact&&typeof input.contact==='object'?input.contact:{};
  const links=Array.isArray(input.legalLinks)?input.legalLinks:defaults.legalLinks;
  const legalLinks=links.slice(0,8).map(item=>({
    label:clean(item?.label,60),
    href:safeHref(item?.href,{mail:true}),
    i18n:clean(item?.i18n,40),
  })).filter(item=>item.label&&item.href);
  const email=clean(contact.email,160)||defaults.contact.email;
  return {
    brand:clean(input.brand,120)||defaults.brand,
    operator:{
      name:clean(operator.name,120)||defaults.operator.name,
      representativeLabel:clean(operator.representativeLabel,40)||defaults.operator.representativeLabel,
      representative:clean(operator.representative,80)||defaults.operator.representative,
      registrationLabel:clean(operator.registrationLabel,60)||defaults.operator.registrationLabel,
      businessRegistrationNumber:clean(operator.businessRegistrationNumber,40)||defaults.operator.businessRegistrationNumber,
    },
    contact:{
      address:clean(contact.address,240)||defaults.contact.address,
      email,
      emailHref:safeHref(contact.emailHref,{mail:true})||`mailto:${email}`,
    },
    legalLinks:legalLinks.length?legalLinks:defaults.legalLinks.map(item=>({...item})),
    copyright:clean(input.copyright,200)||defaults.copyright,
    precedenceNotice:clean(input.precedenceNotice,300)||defaults.precedenceNotice,
    ariaLabel:clean(input.ariaLabel,100)||defaults.ariaLabel,
  };
}
function normalizeChrome(input,tenant){
  const value=input&&typeof input==='object'?input:{};
  return {version:1,header:normalizeHeader(value.header,tenant),footer:normalizeFooter(value.footer,tenant)};
}
function responseHeaders(cache='no-store'){return {'content-type':'application/json; charset=utf-8','cache-control':cache,'access-control-allow-origin':'*','access-control-allow-methods':'GET,PUT,OPTIONS','access-control-allow-headers':'content-type,authorization','x-content-type-options':'nosniff'}}
function json(data,status=200,cache='no-store'){return new Response(JSON.stringify(data),{status,headers:responseHeaders(cache)})}
async function tenantForSubject(env,subjectKey){
  const key=canonicalSiteSubject(subjectKey);if(!key)return null;
  return env.DB.prepare('SELECT id,slug,name,domain,status FROM customer_tenants WHERE slug=? LIMIT 1').bind(key).first();
}
async function settingRow(env,tenantId){return env.DB.prepare('SELECT header_json,footer_json,version,updated_by,updated_at FROM site_chrome_settings WHERE tenant_id=?').bind(tenantId).first()}
function projection(tenant,row){
  const saved={header:parse(row?.header_json,{}),footer:parse(row?.footer_json,{})};
  const chrome=normalizeChrome(saved,tenant);
  return {
    version:Number(row?.version||chrome.version||1),
    subjectKey:canonicalSiteSubject(tenant.slug),
    siteName:siteName(tenant),
    abbreviation:siteAbbreviation(tenant),
    canonicalPath:canonicalPath(tenant.slug),
    canonicalUrl:canonicalUrl(tenant.slug),
    publicDomain:clean(tenant.domain,255),
    header:chrome.header,
    footer:chrome.footer,
    source:row?'site':'default',
    updatedAt:row?.updated_at||null,
    updatedBy:row?.updated_by||null,
  };
}
export async function readSiteChromeSettings(env,subjectKey){
  const tenant=await tenantForSubject(env,subjectKey);if(!tenant||tenant.status!=='active')return null;
  return projection(tenant,await settingRow(env,tenant.id));
}
export async function listSiteChromeSettings(env){
  const rows=await env.DB.prepare(`SELECT t.id,t.slug,t.name,t.domain,t.status,s.header_json,s.footer_json,s.version,s.updated_by,s.updated_at
    FROM customer_tenants t LEFT JOIN site_chrome_settings s ON s.tenant_id=t.id
    WHERE t.status='active' ORDER BY t.name,t.slug`).all();
  const unique=new Map();
  for(const row of rows.results||[]){
    const key=canonicalSiteSubject(row.slug);if(!key||unique.has(key))continue;
    unique.set(key,projection(row,row.header_json!==null||row.footer_json!==null?row:null));
  }
  return [...unique.values()];
}
export async function putSiteChromeSettings(env,subjectKey,input,updatedBy=''){
  const tenant=await tenantForSubject(env,subjectKey);if(!tenant||tenant.status!=='active')return null;
  const next=normalizeChrome(input,tenant);const now=nowIso();const key=canonicalSiteSubject(tenant.slug);
  await env.DB.prepare(`INSERT INTO site_chrome_settings(tenant_id,subject_key,header_json,footer_json,version,updated_by,updated_at)
    VALUES(?,?,?,?,1,?,?) ON CONFLICT(tenant_id) DO UPDATE SET subject_key=excluded.subject_key,header_json=excluded.header_json,footer_json=excluded.footer_json,version=site_chrome_settings.version+1,updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
    .bind(tenant.id,key,JSON.stringify(next.header),JSON.stringify(next.footer),clean(updatedBy,240),now).run();
  return projection(tenant,await settingRow(env,tenant.id));
}
function bearer(request){const auth=clean(request.headers.get('authorization'),8192);return auth.toLowerCase().startsWith('bearer ')?auth.slice(7).trim():''}
async function identity(request){
  const token=bearer(request);if(!token)return null;
  const response=await fetch(`${SUPABASE_URL}/auth/v1/user`,{headers:{apikey:SUPABASE_KEY,authorization:`Bearer ${token}`},signal:AbortSignal.timeout(10000)}).catch(()=>null);
  if(!response?.ok)return null;const user=await response.json().catch(()=>null);
  return user?.id&&user?.email_confirmed_at?{id:String(user.id),email:clean(user.email,240).toLowerCase(),token}:null;
}
async function canManageViaD1(env,who,tenant){
  const grant=await env.DB.prepare('SELECT role,enabled FROM customer_access_grants WHERE tenant_id=? AND email=?').bind(tenant.id,who.email).first();
  return Boolean(grant&&Number(grant.enabled)===1&&MANAGE_ROLES.has(String(grant.role||'').toLowerCase()));
}
async function canManageViaContexts(who,tenant){
  const response=await fetch(`${SUPABASE_URL}/rest/v1/rpc/current_site_activity_contexts`,{method:'POST',headers:{apikey:SUPABASE_KEY,authorization:`Bearer ${who.token}`,'content-type':'application/json'},body:'{}',signal:AbortSignal.timeout(10000)}).catch(()=>null);
  if(!response?.ok)return false;const rows=await response.json().catch(()=>[]);const key=canonicalSiteSubject(tenant.slug);
  return (Array.isArray(rows)?rows:[]).some(row=>canonicalSiteSubject(row?.tenant)===key&&MANAGE_ROLES.has(String(row?.authorization_role||'').toLowerCase()));
}
async function canManageStoreViaSupabase(who,tenant){
  const key=canonicalSiteSubject(tenant.slug);if(!['jadam','pizzamaru','yogurt'].includes(key))return false;
  for(const fn of ['store_user_site_admin_snapshot_v3','store_user_site_admin_snapshot']){
    const response=await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`,{method:'POST',headers:{apikey:SUPABASE_KEY,authorization:`Bearer ${who.token}`,'content-type':'application/json'},body:JSON.stringify({p_slug:key}),signal:AbortSignal.timeout(10000)}).catch(()=>null);
    if(response?.ok)return true;
  }
  return false;
}
async function canManage(env,who,tenant){return await canManageViaD1(env,who,tenant)||await canManageViaContexts(who,tenant)||await canManageStoreViaSupabase(who,tenant)}

export async function handleSiteChromeApi(request,env){
  const url=new URL(request.url);const path=url.pathname.replace(/\/+$/,'');if(!path.startsWith('/v1/site-chrome'))return null;
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:responseHeaders()});
  if(!env?.DB)return json({error:'DATABASE_UNAVAILABLE'},503);
  const subjectKey=canonicalSiteSubject(url.searchParams.get('subject_key'));
  if(!subjectKey)return json({error:'SUBJECT_REQUIRED'},400);
  if(path==='/v1/site-chrome/public'&&request.method==='GET'){
    const current=await readSiteChromeSettings(env,subjectKey);
    if(!current)return json({error:'SITE_NOT_FOUND'},404,'public, max-age=30');
    const {updatedBy,publicDomain,...publicCurrent}=current;
    return json(publicCurrent,200,'public, max-age=60, stale-while-revalidate=300');
  }
  const who=await identity(request);if(!who)return json({error:'AUTH_REQUIRED'},401);
  const tenant=await tenantForSubject(env,subjectKey);if(!tenant||tenant.status!=='active')return json({error:'SITE_NOT_FOUND'},404);
  if(!(await canManage(env,who,tenant)))return json({error:'SUBJECT_FORBIDDEN'},403);
  if(path==='/v1/site-chrome'&&request.method==='GET')return json(await readSiteChromeSettings(env,subjectKey));
  if(path==='/v1/site-chrome'&&request.method==='PUT'){
    if(String(env.ALLOW_MUTATIONS)!=='true')return json({error:'MUTATIONS_DISABLED'},503);
    const data=await request.json().catch(()=>null);if(!data||typeof data!=='object')return json({error:'INVALID_JSON'},400);
    return json(await putSiteChromeSettings(env,subjectKey,data,who.email));
  }
  return json({error:'NOT_FOUND'},404);
}
