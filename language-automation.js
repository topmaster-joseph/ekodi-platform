import { EKODI_SERVICE_MANIFEST, serviceForId } from './ekodi-service-manifest.js';
import {
  EKODI_LANGUAGE_REGISTRY,
  languageForLocale,
  languageStatusSnapshot,
  normalizePlatformLocale,
  publishedLocalesForService
} from './config/language-registry.js';
import { invokeAiProviderCapability } from './ai-provider-control.js';
import { MANAGED_LANGUAGE_SITES, managedLanguageSiteForId } from './config/managed-language-sites.js';

const PREFIX='/api/i18n/v1';
const SOURCE_LOCALE=EKODI_LANGUAGE_REGISTRY.sourceLocale;
const PUBLIC_STAGES=new Set(['source','published']);
const WORK_STAGES=new Set(['queued','stale']);
const PROBE_BATCH=6;
const MAX_SOURCE_STRINGS=80;
const MAX_SOURCE_CHARS=28000;
const REGISTRY_SEED_KEY='registry-seed-version';

const now=()=>new Date().toISOString();
const clean=(value,max=40000)=>String(value??'').trim().slice(0,max);
const serviceId=value=>String(value||'').trim().toLowerCase().replace(/[^a-z0-9-]/g,'');
function json(data,status=200,cache='no-store'){
  return new Response(JSON.stringify(data),{status,headers:{
    'content-type':'application/json; charset=utf-8','cache-control':cache,
    'access-control-allow-origin':'*','access-control-allow-methods':'GET,OPTIONS',
    'access-control-allow-headers':'content-type','x-content-type-options':'nosniff'
  }});
}
function platformService(id){
  const normalized=serviceId(id);
  if(normalized==='ekodi')return{id:'ekodi',name:'EKODI',url:'https://ekodi.kr/',defaultSurface:'public',state:'live'};
  return managedLanguageSiteForId(normalized)||serviceForId(normalized);
}
export function publicTranslationTargets(){
  const services=EKODI_SERVICE_MANIFEST.services.filter(service=>service.defaultSurface==='public'&&service.state!=='planned'&&service.shellIntegration!=='planned');
  const managed=MANAGED_LANGUAGE_SITES.filter(site=>site.translationAutomation!==false);
  return Object.freeze([{id:'ekodi',name:'EKODI',url:'https://ekodi.kr/',defaultSurface:'public',state:'live'},...services,...managed]);
}
function decodeEntities(value){
  const named={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
  return String(value||'').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi,(_,entity)=>{
    const key=entity.toLowerCase();
    if(named[key])return named[key];
    if(key.startsWith('#x'))return String.fromCodePoint(parseInt(key.slice(2),16)||32);
    if(key.startsWith('#'))return String.fromCodePoint(parseInt(key.slice(1),10)||32);
    return ' ';
  });
}
function normalizedVisibleText(value){return decodeEntities(value).replace(/\s+/g,' ').trim();}
function isTranslatableText(value){
  if(value.length<2||value.length>420)return false;
  if(/^https?:\/\//i.test(value)||/^[-+]?\d[\d\s.,:/%-]*$/.test(value))return false;
  if(/^[{}\[\]<>_=;:/\\|`~^*#@]+$/.test(value))return false;
  if(/^(EKODI|www\.|mailto:|tel:)/i.test(value))return false;
  return /[\p{L}\p{N}]/u.test(value);
}
export function extractTranslatableStrings(html){
  const sanitized=String(html||'').replace(/<!--[\s\S]*?-->/g,' ').replace(/<(script|style|noscript|template|svg|code|pre)\b[^>]*>[\s\S]*?<\/\1>/gi,' ');
  const candidates=[];
  const attributePattern=/\b(?:placeholder|title|aria-label|alt)\s*=\s*(["'])([\s\S]*?)\1/gi;
  for(const match of sanitized.matchAll(attributePattern))candidates.push(match[2]);
  const stripped=sanitized.replace(/<br\s*\/?\s*>/gi,'\n').replace(/<\/\s*(?:p|div|section|article|li|h[1-6]|button|a|label|span|td|th|option)\s*>/gi,'\n').replace(/<[^>]+>/g,'\n');
  candidates.push(...stripped.split(/\n+/));
  const unique=[];let total=0;
  for(const raw of candidates){
    const text=normalizedVisibleText(raw);
    if(!isTranslatableText(text)||unique.includes(text))continue;
    if(total+text.length>MAX_SOURCE_CHARS)break;
    unique.push(text);total+=text.length;
    if(unique.length>=MAX_SOURCE_STRINGS)break;
  }
  return unique;
}
export async function sha256Hex(value){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value||'')));
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}
async function metaValue(db,key){const row=await db.prepare('SELECT value FROM language_automation_meta WHERE key=?').bind(key).first();return clean(row?.value,500)}
async function setMeta(db,key,value){await db.prepare('INSERT INTO language_automation_meta (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind(key,String(value),now()).run()}

export async function seedLanguageAutomation(env){
  if(!env.DB?.prepare)return false;
  const seedVersion=`${EKODI_LANGUAGE_REGISTRY.version}:${EKODI_SERVICE_MANIFEST.version}`;
  if(await metaValue(env.DB,REGISTRY_SEED_KEY)===seedVersion)return false;
  const sites=[{id:'ekodi'},...EKODI_SERVICE_MANIFEST.services,...MANAGED_LANGUAGE_SITES];
  const timestamp=now();
  for(const site of sites){
    const published=new Set(publishedLocalesForService(site.id));
    for(const language of EKODI_LANGUAGE_REGISTRY.languages){
      const stage=language.locale===SOURCE_LOCALE?'source':published.has(language.locale)?'published':'queued';
      const publicationStatus=language.locale===SOURCE_LOCALE||published.has(language.locale)?'published':'hidden';
      await env.DB.prepare(`INSERT OR IGNORE INTO language_site_state
        (service_id,locale,stage,updated_at,published_at) VALUES (?,?,?,?,?)`).bind(site.id,language.locale,stage,timestamp,stage==='published'?timestamp:null).run();
      await env.DB.prepare(`INSERT OR IGNORE INTO language_publication_state
        (service_id,locale,publication_status,publication_updated_at,publication_source) VALUES (?,?,?,?,?)`).bind(site.id,language.locale,publicationStatus,timestamp,'registry-seed').run();
    }
  }
  await setMeta(env.DB,REGISTRY_SEED_KEY,seedVersion);
  return true;
}

async function stateRows(env,onlyService=''){
  if(!env.DB?.prepare)return[];
  const query=onlyService
    ?env.DB.prepare(`SELECT s.*,p.publication_status,p.publication_updated_at,p.publication_updated_by,p.publication_source FROM language_site_state s LEFT JOIN language_publication_state p ON p.service_id=s.service_id AND p.locale=s.locale WHERE s.service_id=? ORDER BY s.locale`).bind(onlyService)
    :env.DB.prepare(`SELECT s.*,p.publication_status,p.publication_updated_at,p.publication_updated_by,p.publication_source FROM language_site_state s LEFT JOIN language_publication_state p ON p.service_id=s.service_id AND p.locale=s.locale ORDER BY s.service_id,s.locale`);
  const result=await query.all();
  return result.results||[];
}
function overlaySiteStatus(site,rows){
  const byLocale=new Map(rows.filter(row=>row.service_id===site.id).map(row=>[row.locale,row]));
  const languages=site.languages.map(item=>{
    const row=byLocale.get(item.locale);
    if(!row)return item;
    const stage=clean(row.stage,40)||item.status;
    const stageMeta=EKODI_LANGUAGE_REGISTRY.stages[stage]||EKODI_LANGUAGE_REGISTRY.stages.queued;
    const publicationStatus=stage==='source'?'published':clean(row.publication_status,20)||'hidden';
    const isPublic=PUBLIC_STAGES.has(stage)&&publicationStatus==='published';
    return Object.freeze({...item,status:stage,publicationStatus,public:isPublic,publicationUpdatedAt:row.publication_updated_at||'',publicationUpdatedBy:row.publication_updated_by||'',publicationSource:row.publication_source||'',stageLabelKo:stageMeta.labelKo,stageLabelEn:stageMeta.labelEn,sourceCheckedAt:row.source_checked_at||'',translatedAt:row.translated_at||'',validatedAt:row.validated_at||'',publishedAt:row.published_at||'',updatedAt:row.updated_at||'',lastError:row.last_error||'',provider:row.provider||'',model:row.model||''});
  });
  const publishedLocales=languages.filter(item=>item.public).map(item=>item.locale);
  return Object.freeze({...site,languages:Object.freeze(languages),publishedLocales:Object.freeze(publishedLocales),multilingual:publishedLocales.length>1});
}
export async function languageStatusForAdmin(env){
  await seedLanguageAutomation(env);
  const base=languageStatusSnapshot([...EKODI_SERVICE_MANIFEST.services,...MANAGED_LANGUAGE_SITES]);
  const rows=await stateRows(env);
  return Object.freeze({...base,generatedAt:now(),runtime:true,sites:Object.freeze(base.sites.map(site=>overlaySiteStatus(site,rows)))});
}
function sourceProbeUrl(service){
  const url=new URL(service.url);
  url.searchParams.set('lang',SOURCE_LOCALE);
  url.searchParams.set('ekodi_translation_probe','1');
  return url.toString();
}
async function storeSourceCatalog(env,serviceIdValue,strings,sourceHash){
  const timestamp=now();
  const catalogJson=JSON.stringify({version:1,locale:SOURCE_LOCALE,sourceHash,strings});
  await env.DB.prepare(`INSERT INTO language_catalogs
    (service_id,locale,source_hash,catalog_hash,catalog_json,source_count,updated_at)
    VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(service_id,locale) DO UPDATE SET source_hash=excluded.source_hash,catalog_hash=excluded.catalog_hash,catalog_json=excluded.catalog_json,source_count=excluded.source_count,updated_at=excluded.updated_at`)
    .bind(serviceIdValue,SOURCE_LOCALE,sourceHash,sourceHash,catalogJson,strings.length,timestamp).run();
}
export async function probeServiceSource(env,service,{fetchImpl=globalThis.fetch}={}){
  if(!env.DB?.prepare||typeof fetchImpl!=='function')return{ok:false,error:'automation_unavailable'};
  const timestamp=now();
  try{
    const response=await fetchImpl(sourceProbeUrl(service),{headers:{accept:'text/html','user-agent':'EKODI-Language-Automation/8'},redirect:'follow',signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new Error(`source_http_${response.status}`);
    const type=clean(response.headers.get('content-type'),160).toLowerCase();
    if(type&&!type.includes('text/html'))throw new Error('source_not_html');
    const html=await response.text();
    const strings=extractTranslatableStrings(html);
    if(strings.length<2)throw new Error('source_text_insufficient');
    const sourceHash=await sha256Hex(JSON.stringify(strings));
    const previous=await env.DB.prepare('SELECT source_hash FROM language_site_state WHERE service_id=? AND locale=?').bind(service.id,SOURCE_LOCALE).first();
    const changed=Boolean(previous?.source_hash&&previous.source_hash!==sourceHash);
    await storeSourceCatalog(env,service.id,strings,sourceHash);
    await env.DB.prepare(`UPDATE language_site_state SET source_hash=?,source_checked_at=?,updated_at=?,last_error='' WHERE service_id=? AND locale=?`)
      .bind(sourceHash,timestamp,timestamp,service.id,SOURCE_LOCALE).run();
    if(changed){
      await env.DB.prepare(`UPDATE language_site_state SET source_hash=?,stage=CASE
        WHEN stage='published' THEN 'stale'
        WHEN stage IN ('translating','validating','release-ready') THEN 'queued'
        ELSE stage END,updated_at=?,last_error=''
        WHERE service_id=? AND locale<>?`).bind(sourceHash,timestamp,service.id,SOURCE_LOCALE).run();
      await env.DB.prepare(`UPDATE language_publication_state SET publication_status='hidden',publication_updated_at=?,publication_source='source-change' WHERE service_id=? AND locale<>?`).bind(timestamp,service.id,SOURCE_LOCALE).run();
    }else{
      await env.DB.prepare(`UPDATE language_site_state SET source_hash=?,updated_at=CASE WHEN source_hash='' THEN ? ELSE updated_at END WHERE service_id=? AND locale<>?`)
        .bind(sourceHash,timestamp,service.id,SOURCE_LOCALE).run();
    }
    return{ok:true,serviceId:service.id,sourceHash,changed,stringCount:strings.length};
  }catch(error){
    await env.DB.prepare(`UPDATE language_site_state SET source_checked_at=?,updated_at=?,last_error=? WHERE service_id=? AND locale=?`)
      .bind(timestamp,timestamp,clean(error?.message||error,240),service.id,SOURCE_LOCALE).run().catch(()=>{});
    return{ok:false,serviceId:service.id,error:clean(error?.message||error,240)};
  }
}
async function probeOldestSources(env){
  const targets=publicTranslationTargets();
  const rows=await env.DB.prepare("SELECT service_id,source_checked_at FROM language_site_state WHERE locale=?").bind(SOURCE_LOCALE).all();
  const checked=new Map((rows.results||[]).map(row=>[row.service_id,row.source_checked_at||'']));
  const selected=[...targets].sort((a,b)=>String(checked.get(a.id)||'').localeCompare(String(checked.get(b.id)||''))).slice(0,PROBE_BATCH);
  return Promise.all(selected.map(service=>probeServiceSource(env,service)));

}
function parseTranslationOutput(text){
  const raw=clean(text,80000).replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();
  const first=raw.indexOf('{'),last=raw.lastIndexOf('}');
  if(first<0||last<=first)throw new Error('translation_json_missing');
  const parsed=JSON.parse(raw.slice(first,last+1));
  if(!Array.isArray(parsed?.items))throw new Error('translation_items_missing');
  return parsed.items;
}
function protectedTokens(value){
  const text=String(value||'');
  const tokens=[];
  for(const pattern of [/https?:\/\/[^\s<>"']+/gi,/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,/\b\d[\d.,:/%+-]*\b/g,/\bEKODI\b/g,/\{\{[^{}]+\}\}|\$\{[^{}]+\}|%[sdif]/g]){
    for(const match of text.matchAll(pattern))if(!tokens.includes(match[0]))tokens.push(match[0]);
  }
  return tokens;
}
function normalizedCompare(value){return String(value||'').replace(/\s+/g,' ').trim();}
export function validateTranslationItems(sourceStrings,items,{targetLocale=''}={}){
  const expected=new Map(sourceStrings.map((source,index)=>[`t${index+1}`,source]));
  const received=new Map();
  for(const item of items||[]){
    const id=clean(item?.id,30),text=clean(item?.text,1600);
    if(!expected.has(id)||!text||/<\s*(?:script|iframe)\b|javascript:|\bon(?:error|load|click)\s*=/i.test(text))throw new Error('translation_validation_failed');
    const source=expected.get(id);
    if(targetLocale&&targetLocale!==SOURCE_LOCALE&&/[가-힣]/.test(source)&&source.replace(/[^가-힣]/g,'').length>=4&&normalizedCompare(text)===normalizedCompare(source))throw new Error('translation_untranslated_source');
    if(text.length>Math.max(240,source.length*8))throw new Error('translation_length_outlier');
    for(const token of protectedTokens(source))if(!text.includes(token))throw new Error('translation_protected_token_lost');
    if(received.has(id))throw new Error('translation_duplicate_id');
    received.set(id,text);
  }
  if(received.size!==expected.size)throw new Error('translation_key_parity_failed');
  const catalog={};
  for(const [id,source] of expected)catalog[source]=received.get(id);
  return catalog;
}
async function sourceStringsForJob(env,job){
  const row=await env.DB.prepare('SELECT catalog_json,source_hash FROM language_catalogs WHERE service_id=? AND locale=?').bind(job.service_id,SOURCE_LOCALE).first();
  if(!row?.catalog_json||row.source_hash!==job.source_hash)throw new Error('source_catalog_stale');
  const parsed=JSON.parse(row.catalog_json);
  if(!Array.isArray(parsed?.strings)||!parsed.strings.length)throw new Error('source_catalog_empty');
  return parsed.strings.slice(0,MAX_SOURCE_STRINGS);
}
async function nextTranslationJob(env){
  const allowed=new Set(publicTranslationTargets().map(service=>service.id));
  const rows=await env.DB.prepare("SELECT * FROM language_site_state WHERE stage IN ('queued','stale') AND locale<>? AND source_hash<>'' ORDER BY updated_at ASC,service_id ASC,locale ASC LIMIT 80").bind(SOURCE_LOCALE).all();
  return(rows.results||[]).find(row=>allowed.has(row.service_id)&&WORK_STAGES.has(row.stage))||null;
}
async function setJobStage(env,job,stage,extra={}){
  const timestamp=now();
  await env.DB.prepare(`UPDATE language_site_state SET stage=?,updated_at=?,last_error=?,provider=?,model=?,translated_at=COALESCE(?,translated_at),validated_at=COALESCE(?,validated_at),published_at=COALESCE(?,published_at),catalog_hash=COALESCE(?,catalog_hash) WHERE service_id=? AND locale=?`)
    .bind(stage,timestamp,clean(extra.lastError,240),clean(extra.provider,80),clean(extra.model,160),extra.translatedAt||null,extra.validatedAt||null,extra.publishedAt||null,extra.catalogHash||null,job.service_id,job.locale).run();
}
async function storeTranslatedCatalog(env,job,catalog,catalogHash){
  const catalogJson=JSON.stringify({version:1,locale:job.locale,sourceHash:job.source_hash,items:catalog});
  await env.DB.prepare(`INSERT INTO language_catalogs
    (service_id,locale,source_hash,catalog_hash,catalog_json,source_count,updated_at)
    VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(service_id,locale) DO UPDATE SET source_hash=excluded.source_hash,catalog_hash=excluded.catalog_hash,catalog_json=excluded.catalog_json,source_count=excluded.source_count,updated_at=excluded.updated_at`)
    .bind(job.service_id,job.locale,job.source_hash,catalogHash,catalogJson,Object.keys(catalog).length,now()).run();
}
export async function translateNextLanguage(env){
  if(!env.DB?.prepare)return{ok:false,error:'database_unavailable'};
  const job=await nextTranslationJob(env);
  if(!job)return{ok:true,idle:true};
  const language=languageForLocale(job.locale);
  if(!language){await setJobStage(env,job,'blocked',{lastError:'language_not_registered'});return{ok:false,serviceId:job.service_id,locale:job.locale,error:'language_not_registered'}}
  await setJobStage(env,job,'translating');
  try{
    const strings=await sourceStringsForJob(env,job);
    const items=strings.map((source,index)=>({id:`t${index+1}`,source}));
    const system=`You are EKODI's internal localization engine. Translate public website UI/content from Korean into ${language.nativeName} (${language.locale}). Return JSON only in exactly this shape: {"items":[{"id":"t1","text":"..."}]}. Keep every input id exactly once and in order. Preserve EKODI, brand names, URLs, email addresses, numbers, placeholders and product codes. Do not add HTML, markdown, commentary or claims not present in the source. Use natural, respectful website language.`;
    const input=JSON.stringify({serviceId:job.service_id,targetLocale:job.locale,items});
    const result=await invokeAiProviderCapability(env,{capability:'translation',system,input,maxOutputTokens:8192});
    const translatedAt=now();
    await setJobStage(env,job,'validating',{provider:result.provider,model:result.model,translatedAt});
    const catalog=validateTranslationItems(strings,parseTranslationOutput(result.text),{targetLocale:job.locale});
    const catalogHash=await sha256Hex(JSON.stringify(catalog));
    const validatedAt=now();
    await setJobStage(env,job,'release-ready',{provider:result.provider,model:result.model,translatedAt,validatedAt,catalogHash});
    await storeTranslatedCatalog(env,job,catalog,catalogHash);
    const publishedAt=now();
    await setJobStage(env,job,'published',{provider:result.provider,model:result.model,translatedAt,validatedAt,publishedAt,catalogHash});
    return{ok:true,serviceId:job.service_id,locale:job.locale,stage:'published',provider:result.provider,model:result.model,count:strings.length};
  }catch(error){
    await setJobStage(env,job,'queued',{lastError:clean(error?.message||error,240)}).catch(()=>{});
    return{ok:false,serviceId:job.service_id,locale:job.locale,error:clean(error?.message||error,240)};
  }
}

export async function runLanguageAutomation(env){
  if(!env.DB?.prepare)return{ok:false,error:'database_unavailable'};
  await seedLanguageAutomation(env);
  const probes=await probeOldestSources(env);
  const translation=await translateNextLanguage(env);
  return{ok:true,generatedAt:now(),probes,translation};
}
async function publicServiceStatus(env,id){
  const service=platformService(id);if(!service)return null;
  const base=languageStatusSnapshot([...EKODI_SERVICE_MANIFEST.services,...MANAGED_LANGUAGE_SITES]).sites.find(site=>site.id===service.id);
  if(!base)return null;
  if(!env.DB?.prepare)return base;
  await seedLanguageAutomation(env);
  const rows=await stateRows(env,service.id).catch(()=>[]);
  return rows.length?overlaySiteStatus(base,rows):base;
}
const PUBLICATION_STATES=new Set(['published','hidden']);
export async function languageSiteStatusForAdmin(env,id){
  const status=await languageStatusForAdmin(env);
  return status.sites.find(site=>site.id===serviceId(id))||null;
}
export async function setLanguagePublication(env,{serviceIdValue,localeValue,publicationStatus,actor='',source='admin'}={}){
  if(!env.DB?.prepare)return{ok:false,error:'database_unavailable',status:503};
  await seedLanguageAutomation(env);
  const id=serviceId(serviceIdValue),service=platformService(id),locale=normalizePlatformLocale(localeValue),next=clean(publicationStatus,20);
  if(!service)return{ok:false,error:'service_not_found',status:404};
  if(!locale)return{ok:false,error:'language_not_registered',status:400};
  if(!PUBLICATION_STATES.has(next))return{ok:false,error:'publication_status_invalid',status:400};
  const row=await env.DB.prepare(`SELECT s.stage,p.publication_status FROM language_site_state s LEFT JOIN language_publication_state p ON p.service_id=s.service_id AND p.locale=s.locale WHERE s.service_id=? AND s.locale=?`).bind(id,locale).first();
  if(!row)return{ok:false,error:'language_state_not_found',status:404};
  if(locale===SOURCE_LOCALE&&next!=='published')return{ok:false,error:'source_locale_must_remain_published',status:409};
  if(next==='published'&&!PUBLIC_STAGES.has(clean(row.stage,40)))return{ok:false,error:'translation_not_ready',status:409};
  const timestamp=now();
  await env.DB.prepare(`INSERT INTO language_publication_state (service_id,locale,publication_status,publication_updated_at,publication_updated_by,publication_source) VALUES (?,?,?,?,?,?) ON CONFLICT(service_id,locale) DO UPDATE SET publication_status=excluded.publication_status,publication_updated_at=excluded.publication_updated_at,publication_updated_by=excluded.publication_updated_by,publication_source=excluded.publication_source`)
    .bind(id,locale,next,timestamp,clean(actor,160),clean(source,80)).run();
  return{ok:true,status:200,site:await languageSiteStatusForAdmin(env,id),locale,publicationStatus:next};
}
function tenantAdminHeaders(request){
  const headers=new Headers({'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','vary':'Origin'});
  const origin=String(request.headers.get('origin')||'');
  try{const url=new URL(origin);if(url.protocol==='https:'&&(url.hostname==='ekodi.kr'||url.hostname.endsWith('.ekodi.kr')||url.hostname==='cgma.or.kr'||url.hostname==='www.cgma.or.kr'))headers.set('access-control-allow-origin',origin)}catch{}
  headers.set('access-control-allow-methods','GET,PUT,OPTIONS');headers.set('access-control-allow-headers','authorization,content-type');return headers;
}
function tenantAdminJson(request,data,status=200){return new Response(JSON.stringify(data),{status,headers:tenantAdminHeaders(request)})}
async function tenantLanguageAuthority(request,env,site){
  const authorization=String(request.headers.get('authorization')||'');
  if(!authorization.startsWith('Bearer '))return{ok:false,status:401,error:'login_required'};
  const authority=site?.authority;if(!authority||authority.provider!=='supabase-access-api')return{ok:false,status:403,error:'site_admin_authority_unavailable'};
  const base=String(env.MY_SUPABASE_URL||'').replace(/\/$/,'');const key=String(env.MY_SUPABASE_PUBLISHABLE_KEY||'');
  if(!base||!key)return{ok:false,status:503,error:'site_admin_authority_unconfigured'};
  const tenant=String(authority.tenantSlug||'').trim();const endpoint=tenant?'reviewer':'me';
  const url=new URL(base+'/functions/v1/access-api/'+endpoint);url.searchParams.set('site',authority.siteKey);if(tenant)url.searchParams.set('tenant',tenant);
  const response=await fetch(url,{headers:{authorization,apikey:key,accept:'application/json'},signal:AbortSignal.timeout(10000)}).catch(()=>null);
  const data=await response?.json().catch(()=>({}))||{};
  if(tenant){if(!response?.ok||data.allowed!==true)return{ok:false,status:response?.status||503,error:data.error||'site_admin_required'};return{ok:true,authority:data.authority||'tenant',role:data.role||'tenant_admin',scope:data.scope||('tenant:'+tenant)}}
  const role=String(data.role||'').trim().toLowerCase();const allowed=new Set(['platform_admin','tenant_admin','workspace_admin','client_admin','hq_manager','store_owner','owner','admin','senior_pastor','manager']);
  if(!response?.ok||data.authenticated!==true||!['active','pre_registered'].includes(String(data.status||''))||!allowed.has(role))return{ok:false,status:response?.status===401?401:403,error:'site_admin_required'};
  return{ok:true,authority:role==='platform_admin'?'platform':'site',role,scope:'site:'+authority.siteKey};
}
export async function handleLanguageTenantAdmin(request,env={}){
  const url=new URL(request.url);if(!url.pathname.startsWith(PREFIX+'/admin'))return null;
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:tenantAdminHeaders(request)});
  const id=serviceId(url.searchParams.get('service'));const site=managedLanguageSiteForId(id);if(!site)return tenantAdminJson(request,{error:'managed_site_not_found'},404);
  const access=await tenantLanguageAuthority(request,env,site);if(!access.ok)return tenantAdminJson(request,{error:access.error},access.status);
  if(request.method==='GET'&&url.pathname===PREFIX+'/admin/status'){
    const status=await languageSiteStatusForAdmin(env,id);return status?tenantAdminJson(request,{site:status,authority:access}):tenantAdminJson(request,{error:'service_not_found'},404);
  }
  if(request.method==='PUT'&&url.pathname===PREFIX+'/admin/publication'){
    let body={};try{body=await request.json()}catch{return tenantAdminJson(request,{error:'invalid_json'},400)}
    const actor=access.authority+':'+access.role;const result=await setLanguagePublication(env,{serviceIdValue:id,localeValue:body.locale,publicationStatus:body.publicationStatus,actor,source:'site-admin'});
    return tenantAdminJson(request,result,result.status||200);
  }
  return tenantAdminJson(request,{error:'not_found'},404);
}

export async function handleLanguageAutomationPublic(request,env={}){
  const url=new URL(request.url);
  if(!url.pathname.startsWith(PREFIX))return null;
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'GET,OPTIONS','access-control-allow-headers':'content-type','access-control-max-age':'86400'}});
  if(request.method!=='GET')return json({error:'method_not_allowed'},405);
  if(url.pathname===`${PREFIX}/status`){
    const id=serviceId(url.searchParams.get('service')||'ekodi');
    const status=await publicServiceStatus(env,id);
    if(!status)return json({error:'service_not_found'},404);
    return json({schemaVersion:1,serviceId:id,sourceLocale:SOURCE_LOCALE,publishedLocales:status.publishedLocales,languages:status.languages.map(item=>({locale:item.locale,status:item.status,public:item.public}))},200,'public, max-age=30, stale-while-revalidate=120');
  }
  if(url.pathname===`${PREFIX}/catalog`){
    const id=serviceId(url.searchParams.get('service')||'ekodi');
    const locale=normalizePlatformLocale(url.searchParams.get('locale'));
    if(!platformService(id)||!locale||locale===SOURCE_LOCALE)return json({error:'catalog_not_found'},404,'public, max-age=30');
    if(!env.DB?.prepare)return json({error:'catalog_not_found'},404,'public, max-age=30');
    const state=await env.DB.prepare(`SELECT s.stage,s.source_hash,s.catalog_hash,p.publication_status FROM language_site_state s LEFT JOIN language_publication_state p ON p.service_id=s.service_id AND p.locale=s.locale WHERE s.service_id=? AND s.locale=?`).bind(id,locale).first();
    if(state?.stage!=='published'||state?.publication_status!=='published')return json({error:'catalog_not_published'},404,'public, max-age=30');
    const catalog=await env.DB.prepare('SELECT catalog_json,source_hash,catalog_hash,updated_at FROM language_catalogs WHERE service_id=? AND locale=?').bind(id,locale).first();
    if(!catalog?.catalog_json||catalog.source_hash!==state.source_hash)return json({error:'native_or_missing_catalog'},404,'public, max-age=30');
    let parsed={};try{parsed=JSON.parse(catalog.catalog_json)}catch{return json({error:'catalog_invalid'},503)}
    return json({...parsed,serviceId:id,catalogHash:catalog.catalog_hash,updatedAt:catalog.updated_at},200,'public, max-age=60, stale-while-revalidate=300');
  }
  return json({error:'not_found'},404);
}

export const LANGUAGE_AUTOMATION_CONTRACT=Object.freeze({version:'ekodi.language-automation.v2',prefix:PREFIX,sourceLocale:SOURCE_LOCALE,probeBatch:PROBE_BATCH,maxTranslationsPerRun:1,publicSurfacesOnly:true,adminReadOnly:false,publicationControl:'site-scoped-and-platform-aggregate'});
