import { evaluateMissionAction } from './ai-governance-runtime.js';
import { CHANNEL_AUTOMATION_TEMPLATES, channelAutomationEntitlement } from './channel-automation-policy.js';
import { channelCredentialReady, channelStateHash, decryptChannelCredential, encryptChannelCredential, randomChannelId, randomChannelToken } from './channel-credential-vault.js';
import { exchangeYoutubeCode, listYoutubeChannels, uploadYoutubeVideo, youtubeAuthorizeUrl, youtubeOAuthConfigured } from './channel-youtube-adapter.js';
import { channelAutomationActor, resolveChannelAutomationSubject } from './channel-automation-subject.js';
import { automationEntitlement, listAutomationProfiles, upsertAutomationProfile } from './channel-automation-runtime.js';
import { disconnectManagedConnection, handleYoutubeCallback, listManagedConnections, managedCredential, selectYoutubeConnection, startYoutubeConnection, youtubeConnectionReady } from './channel-oauth-control.js';
import { channelServiceBridgeReady, channelServiceBridgeSchemaReady, listServiceChannels, scheduleServiceYoutube } from './channel-service-bridge.js';
import { EKODI_SERVICE_MANIFEST } from './ekodi-service-manifest.js';
import { channelAdminServices, canonicalServiceChannelAdminUrl } from './admin-service-catalog.js';
import { FB_REELS_DAILY_LIMIT, absoluteFacebookUrl, instagramPermalink, instagramPublishingQuota, instagramQuotaDecision, metaAiLabelFields, publishFacebookReel, publishInstagramReel } from './channel-meta-reels-adapter.js';
import { abandonIdempotentRequest, assertAiCaptionHonest, beginIdempotentRequest, canonicalPostUrl, completeIdempotentRequest, contentFormat, contentIsAiGenerated, markVariantPublished, recentPublishedReels, resolveYoutubePrivacy, tokenHealthDue } from './channel-publish-hardening.js';

const SUPABASE_URL = 'https://renzehysxirjilvdxacv.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const WRITE_ROLES = new Set(['tenant_admin','admin','store_owner','hq_manager','client_admin','client_editor','manager','owner']);
const SUBJECT_TYPES = new Set(['person','tenant','store']);
const JOB_STATES = new Set(['scheduled','queued','publishing','published','retrying','failed','cancelled','credentials_required']);
const MAX_CAPTION = 12000;

function cors(request, env) {
  const origin = String(request.headers.get('origin') || '');
  const configured = String(env.ALLOWED_ORIGINS || '').split(',').map(v => v.trim()).filter(Boolean);
  let allowed = !origin || configured.includes(origin);
  if (!allowed) {
    try {
      const host = new URL(origin).hostname;
      allowed = host === 'ekodi.kr' || host === 'marketing.ekodi.kr' || host === 'my.ekodi.kr' || /^[a-z0-9-]+\.ai\.ekodi\.kr$/i.test(host);
    } catch {}
  }
  const headers = {
    'access-control-allow-headers':'content-type, authorization, idempotency-key',
    'access-control-allow-methods':'GET, POST, PUT, DELETE, OPTIONS',
    'access-control-max-age':'86400',
    vary:'Origin',
  };
  if (origin && allowed) headers['access-control-allow-origin'] = origin;
  return { allowed, headers };
}

function json(request, env, data, status = 200) {
  const { allowed, headers } = cors(request, env);
  return new Response(JSON.stringify(data), {
    status,
    headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...headers},
  });
}

async function readJson(request) { try { return await request.json(); } catch { return null; } }
const clean = (v, max = 240) => String(v || '').trim().slice(0, max);
const nowIso = () => new Date().toISOString();
function safeParse(value, fallback = {}) { try { return JSON.parse(value || ''); } catch { return fallback; } }
function safeJson(value, fallback = {}) { try { return JSON.stringify(value ?? fallback); } catch { return JSON.stringify(fallback); } }
function safeUrl(value) {
  const raw = clean(value, 2048);
  if (!raw) return '';
  try { const u = new URL(raw); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; }
}

async function identityFromRequest(request, env) { return channelAutomationActor(request, env); }
async function resolveSubject(env, identity, type, key) { return resolveChannelAutomationSubject(env, identity, type, key); }

function subjectParams(url) {
  return { type:url.searchParams.get('subject_type') || 'person', key:url.searchParams.get('subject_key') || '' };
}

async function authSubject(request, env, { write = false } = {}) {
  const identity = await identityFromRequest(request, env);
  if (!identity) return { error:'AUTH_REQUIRED', status:401 };
  const url = new URL(request.url);
  const params = subjectParams(url);
  const subject = await resolveSubject(env, identity, params.type, params.key);
  if (!subject) return { error:'SUBJECT_FORBIDDEN', status:403 };
  if (write && !subject.writable) return { error:'SUBJECT_READ_ONLY', status:403 };
  return { identity, subject };
}

async function schemaReady(env) {
  if (!env.DB) return false;
  try {
    await env.DB.prepare('SELECT 1 FROM marketing_publication_jobs LIMIT 0').all();
    return true;
  } catch { return false; }
}

async function channelSchemaReady(env) {
  if (!env.DB) return false;
  try {
    await env.DB.batch([
      env.DB.prepare('SELECT 1 FROM channel_automation_profiles LIMIT 0'),
      env.DB.prepare('SELECT 1 FROM channel_oauth_connections LIMIT 0')
    ]);
    return true;
  } catch { return false; }
}

async function channelSiteBindingSchemaReady(env) {
  if (!env.DB) return false;
  try { await env.DB.prepare('SELECT 1 FROM channel_site_bindings LIMIT 0').all(); return true; }
  catch { return false; }
}

async function automationSnapshot(request,env,subject) {
  const entitlement=await automationEntitlement(env,subject);
  const [profiles,connections,channels,jobs,policy]=await Promise.all([
    listAutomationProfiles(env,subject),
    listManagedConnections(env,subject),
    env.DB.prepare('SELECT id,provider,channel_type,display_name,external_account_id,status,config_json,last_check_at,last_error,created_at,updated_at FROM marketing_publish_channels WHERE subject_type=? AND subject_key=? ORDER BY id DESC').bind(subject.type,subject.key).all(),
    env.DB.prepare('SELECT id,channel_id,schedule_kind,scheduled_at,recurrence_rule,status,requested_by,attempt_count,max_attempts,next_attempt_at,external_post_url,last_error,published_at,created_at FROM marketing_publication_jobs WHERE subject_type=? AND subject_key=? ORDER BY created_at DESC LIMIT 50').bind(subject.type,subject.key).all(),
    getPolicy(env,subject),
  ]);
  return json(request,env,{subject:{type:subject.type,key:subject.key,workspaceId:subject.workspaceId||'',workspaceSlug:subject.workspaceSlug||''},entitlement,profiles,connections,channels:(channels.results||[]).map(row=>({...row,config:safeParse(row.config_json,{})})),jobs:jobs.results||[],policy:{mode:policy.mode,maxDailyPosts:Number(policy.max_daily_posts||5),allowedProviders:safeParse(policy.allowed_providers_json,[]),quietHours:safeParse(policy.quiet_hours_json,{})},youtubeOAuthAvailable:youtubeConnectionReady(env)});
}

async function audit(env, subject, jobId, action, detail = '', actor = '') {
  await env.DB.prepare(`INSERT INTO marketing_publication_audit(subject_type,subject_key,workspace_id,job_id,action,detail,actor,created_at)
    VALUES(?,?,?,?,?,?,?,?)`).bind(subject.type, subject.key, subject.workspaceId || '', jobId || null, clean(action,80), clean(detail,1000), clean(actor,160), nowIso()).run();
}

async function getPolicy(env, subject) {
  const row = await env.DB.prepare('SELECT mode,max_daily_posts,allowed_providers_json,quiet_hours_json FROM marketing_publish_policies WHERE subject_type=? AND subject_key=?')
    .bind(subject.type, subject.key).first();
  return row || { mode:'review', max_daily_posts:5, allowed_providers_json:'[]', quiet_hours_json:'{}' };
}

async function upsertBrand(request, env, identity, subject) {
  const body = await readJson(request);
  if (!body) return json(request, env, {error:'INVALID_JSON'}, 400);
  const brandName = clean(body.brandName, 120);
  if (!brandName) return json(request, env, {error:'BRAND_NAME_REQUIRED'}, 400);
  const now = nowIso();
  await env.DB.prepare(`INSERT INTO marketing_brand_profiles(subject_type,subject_key,workspace_id,brand_name,tagline,audience_summary,voice_json,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?)
    ON CONFLICT(subject_type,subject_key) DO UPDATE SET brand_name=excluded.brand_name,tagline=excluded.tagline,audience_summary=excluded.audience_summary,voice_json=excluded.voice_json,updated_at=excluded.updated_at`)
    .bind(subject.type, subject.key, subject.workspaceId || '', brandName, clean(body.tagline,240), clean(body.audienceSummary,1200), safeJson(body.voice || {}), now, now).run();
  await audit(env, subject, null, 'brand_profile_updated', brandName, identity.email);
  return json(request, env, {ok:true,subject:{type:subject.type,key:subject.key},brandName});
}

async function readBrand(request, env, subject) {
  const row = await env.DB.prepare('SELECT brand_name,tagline,audience_summary,voice_json,created_at,updated_at FROM marketing_brand_profiles WHERE subject_type=? AND subject_key=?')
    .bind(subject.type, subject.key).first();
  return json(request, env, {subject:{type:subject.type,key:subject.key},brand:row ? {...row,voice:safeParse(row.voice_json,{})} : null});
}

async function upsertPolicy(request, env, identity, subject) {
  const body = await readJson(request);
  if (!body) return json(request, env, {error:'INVALID_JSON'}, 400);
  const mode = ['review','assisted','autonomous'].includes(body.mode) ? body.mode : 'review';
  const maxDaily = Math.max(1, Math.min(100, Number(body.maxDailyPosts || 5)));
  const providers = Array.isArray(body.allowedProviders) ? body.allowedProviders.map(v=>clean(v,80)).filter(Boolean).slice(0,30) : [];
  const now = nowIso();
  await env.DB.prepare(`INSERT INTO marketing_publish_policies(subject_type,subject_key,workspace_id,mode,max_daily_posts,allowed_providers_json,quiet_hours_json,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(subject_type,subject_key) DO UPDATE SET mode=excluded.mode,max_daily_posts=excluded.max_daily_posts,allowed_providers_json=excluded.allowed_providers_json,quiet_hours_json=excluded.quiet_hours_json,updated_at=excluded.updated_at`)
    .bind(subject.type, subject.key, subject.workspaceId || '', mode, maxDaily, safeJson(providers,[]), safeJson(body.quietHours || {}), now, now).run();
  await audit(env, subject, null, 'publish_policy_updated', `${mode}:${maxDaily}`, identity.email);
  return json(request, env, {ok:true,mode,maxDailyPosts:maxDaily,allowedProviders:providers});
}

function channelControl(config={}) {
  const hhmm=value=>/^([01]\d|2[0-3]):[0-5]\d$/.test(String(value||''))?String(value):'';
  return {
    autoPublishEnabled:config.autoPublishEnabled!==false,
    maxPostsPerDay:Math.max(0,Math.min(100,Number(config.maxPostsPerDay||0))),
    minHoursBetweenPosts:Math.max(0,Math.min(168,Number(config.minHoursBetweenPosts||0))),
    publishWindowStart:hhmm(config.publishWindowStart),
    publishWindowEnd:hhmm(config.publishWindowEnd),
    timezone:clean(config.timezone||'Asia/Seoul',80)||'Asia/Seoul',
    maxAttempts:Math.max(1,Math.min(20,Number(config.maxAttempts||5))),
  };
}
function timeWindowOpen(start,end,timezone) {
  if(!start||!end)return true;
  let parts;try{parts=new Intl.DateTimeFormat('en-GB',{timeZone:timezone||'Asia/Seoul',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date())}catch{return true}
  const hour=Number(parts.find(x=>x.type==='hour')?.value||0),minute=Number(parts.find(x=>x.type==='minute')?.value||0),now=hour*60+minute,toMin=v=>Number(v.slice(0,2))*60+Number(v.slice(3,5)),a=toMin(start),b=toMin(end);
  return a===b?true:a<b?(now>=a&&now<b):(now>=a||now<b);
}
function policyWindowOpen(policy) {
  const q=safeParse(policy?.quiet_hours_json,{}),start=String(q.start||''),end=String(q.end||'');
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(end))return true;
  return timeWindowOpen(start,end,clean(q.timezone||'Asia/Seoul',80)||'Asia/Seoul');
}
async function readPolicy(request,env,subject){
  const policy=await getPolicy(env,subject);
  return json(request,env,{policy:{mode:policy.mode,maxDailyPosts:Number(policy.max_daily_posts||5),allowedProviders:safeParse(policy.allowed_providers_json,[]),quietHours:safeParse(policy.quiet_hours_json,{})}});
}
async function updateChannelControl(request,env,identity,subject,id){
  const body=await readJson(request);if(!body)return json(request,env,{error:'INVALID_JSON'},400);
  const row=await env.DB.prepare('SELECT id,status,credential_ref,config_json,last_error FROM marketing_publish_channels WHERE id=? AND subject_type=? AND subject_key=?').bind(Number(id),subject.type,subject.key).first();
  if(!row)return json(request,env,{error:'CHANNEL_NOT_FOUND'},404);
  const existing=safeParse(row.config_json,{}),control=channelControl({...existing,...body}),next={...existing,...control};
  let status='paused';
  if(control.autoPublishEnabled){
    const revoked=String(row.last_error||'')==='connection_revoked';
    const ready=!revoked&&await channelCredentialConfigured(env,{...row,config_json:safeJson(next)});
    status=ready?'active':'credentials_required';
  }
  await env.DB.prepare('UPDATE marketing_publish_channels SET status=?,config_json=?,updated_at=? WHERE id=? AND subject_type=? AND subject_key=?').bind(status,safeJson(next),nowIso(),Number(id),subject.type,subject.key).run();
  await audit(env,subject,null,'channel_control_updated',`${id}:${status}:${control.maxPostsPerDay}:${control.minHoursBetweenPosts}`,identity.email);
  return json(request,env,{ok:true,channelId:Number(id),status,control});
}

function channelSiteCatalog() {
  const merged=new Map();
  for(const service of EKODI_SERVICE_MANIFEST.services.filter(service=>service?.id&&service?.url)){
    merged.set(service.id,{id:service.id,name:service.name,shortName:service.shortName||service.name,url:service.url,group:service.group||'',state:service.state||'live',channelSubjectKey:service.tenantSlug||'',channelAdminUrl:''});
  }
  for(const site of channelAdminServices()){
    const current=merged.get(site.id)||{};
    merged.set(site.id,{...current,id:site.id,name:site.name,shortName:site.name,url:`https://ekodi.kr${site.basePath}`,group:site.group||current.group||'sites',state:'live',channelSubjectKey:site.channelSubjectKey||'',channelAdminUrl:canonicalServiceChannelAdminUrl(site),siteRelation:site.siteRelation||''});
  }
  return [...merged.values()];
}
function channelSiteForId(serviceId){
  const id=clean(serviceId,80).toLowerCase();
  return channelSiteCatalog().find(site=>site.id===id)||null;
}

function canonicalChannelSubjectKey(value){
  const key=clean(value,120).toLowerCase();
  return ({
    ekodibiz:'ekodi-biz','ekodi-biz':'ekodi-biz',
    ekodichurch:'ekodi-church','ekodi-church':'ekodi-church',
    'ekodi-trade':'ekoditrade','ekodibiz-trade':'ekoditrade',ekoditrade:'ekoditrade',
    ekodilab:'ekodi-lab','ekodi-lab':'ekodi-lab',
    cheonggye:'cheonggye-local','cheonggye-local':'cheonggye-local'
  })[key]||key;
}
function siteBindingOwnedBySubject(subject,site){
  const owner=canonicalChannelSubjectKey(site?.channelSubjectKey||'');
  return Boolean(owner&&owner===canonicalChannelSubjectKey(subject?.workspaceSlug||subject?.key||''));
}
function canManageChannelSite(identity,subject,site){
  return Boolean(identity?.platformAdmin&&identity?.adminRole==='super_admin')||siteBindingOwnedBySubject(subject,site);
}
function normalizeChannelSiteBinding(input={}) {
  const serviceId=clean(input.serviceId,80).toLowerCase();
  const service=channelSiteForId(serviceId);
  if(!service) throw Object.assign(new Error('CHANNEL_SITE_SERVICE_NOT_FOUND'),{code:'CHANNEL_SITE_SERVICE_NOT_FOUND',status:400});
  const role=['primary','secondary','archive_only'].includes(String(input.role||''))?String(input.role):'primary';
  return {
    serviceId,
    role,
    isDefault:Boolean(input.isDefault),
    autoArchive:Boolean(input.autoArchive),
    archiveCategory:clean(input.archiveCategory||'past-event',80)||'past-event',
    enabled:input.enabled!==false,
    priority:Math.max(0,Math.min(9999,Number(input.priority??100)||0)),
    site:{id:service.id,name:service.name,url:service.url,group:service.group||'',channelAdminUrl:service.channelAdminUrl||'',channelSubjectKey:service.channelSubjectKey||''},
  };
}
async function channelSiteBindings(env,subject,{channelId=0,serviceId=''}={}) {
  const where=['c.subject_type=?','c.subject_key=?'];
  const args=[subject.type,subject.key];
  if(Number(channelId)>0){where.push('b.channel_id=?');args.push(Number(channelId))}
  if(serviceId){where.push('b.service_id=?');args.push(clean(serviceId,80).toLowerCase())}
  const result=await env.DB.prepare(`SELECT b.id,b.channel_id,b.service_id,b.role,b.is_default,b.auto_archive,b.archive_category,b.enabled,b.priority,b.created_at,b.updated_at,
    c.provider,c.channel_type,c.display_name,c.external_account_id,c.status AS channel_status
    FROM channel_site_bindings b JOIN marketing_publish_channels c ON c.id=b.channel_id
    WHERE ${where.join(' AND ')} ORDER BY b.service_id,b.is_default DESC,b.priority ASC,b.id ASC`).bind(...args).all();
  return (result.results||[]).map(row=>{
    const service=channelSiteForId(row.service_id);
    return {...row,isDefault:Boolean(row.is_default),autoArchive:Boolean(row.auto_archive),enabled:Boolean(row.enabled),
      site:service?{id:service.id,name:service.name,url:service.url,group:service.group||'',channelAdminUrl:service.channelAdminUrl||'',channelSubjectKey:service.channelSubjectKey||''}:null};
  });
}
async function readChannelSites(request,env,subject,channelId) {
  const channel=await env.DB.prepare('SELECT id FROM marketing_publish_channels WHERE id=? AND subject_type=? AND subject_key=?').bind(Number(channelId),subject.type,subject.key).first();
  if(!channel)return json(request,env,{error:'CHANNEL_NOT_FOUND'},404);
  return json(request,env,{channelId:Number(channelId),bindings:await channelSiteBindings(env,subject,{channelId}),sites:channelSiteCatalog()});
}
async function replaceChannelSites(request,env,identity,subject,channelId) {
  const body=await readJson(request); if(!body||!Array.isArray(body.bindings))return json(request,env,{error:'CHANNEL_SITE_BINDINGS_REQUIRED'},400);
  const channel=await env.DB.prepare('SELECT id FROM marketing_publish_channels WHERE id=? AND subject_type=? AND subject_key=?').bind(Number(channelId),subject.type,subject.key).first();
  if(!channel)return json(request,env,{error:'CHANNEL_NOT_FOUND'},404);
  let bindings;
  try{bindings=body.bindings.slice(0,100).map(normalizeChannelSiteBinding)}
  catch(error){return json(request,env,{error:error.code||'CHANNEL_SITE_BINDING_INVALID'},error.status||400)}
  const seen=new Set();
  for(const binding of bindings){
    if(seen.has(binding.serviceId))return json(request,env,{error:'CHANNEL_SITE_DUPLICATE_SERVICE',serviceId:binding.serviceId},400);
    if(!canManageChannelSite(identity,subject,binding.site))return json(request,env,{error:'CHANNEL_SITE_FORBIDDEN',serviceId:binding.serviceId},403);
    seen.add(binding.serviceId);
  }
  const now=nowIso();
  const statements=[];
  for(const binding of bindings.filter(item=>item.isDefault&&item.enabled)){
    statements.push(env.DB.prepare(`UPDATE channel_site_bindings SET is_default=0,updated_at=? WHERE subject_type=? AND subject_key=? AND service_id=? AND channel_id<>?`)
      .bind(now,subject.type,subject.key,binding.serviceId,Number(channelId)));
  }
  statements.push(env.DB.prepare('DELETE FROM channel_site_bindings WHERE subject_type=? AND subject_key=? AND channel_id=?').bind(subject.type,subject.key,Number(channelId)));
  for(const binding of bindings){
    statements.push(env.DB.prepare(`INSERT INTO channel_site_bindings(subject_type,subject_key,workspace_id,channel_id,service_id,role,is_default,auto_archive,archive_category,enabled,priority,created_by_email,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(subject.type,subject.key,subject.workspaceId||'',Number(channelId),binding.serviceId,binding.role,binding.isDefault?1:0,binding.autoArchive?1:0,binding.archiveCategory,binding.enabled?1:0,binding.priority,identity.email,now,now));
  }
  await env.DB.batch(statements);
  await audit(env,subject,null,'channel_site_bindings_replaced',`${channelId}:${bindings.map(item=>item.serviceId).join(',')}`,identity.email);
  return json(request,env,{ok:true,channelId:Number(channelId),bindings:await channelSiteBindings(env,subject,{channelId})});
}
async function listSitePublishingChannels(request,env,identity,subject,serviceId) {
  const service=channelSiteForId(clean(serviceId,80).toLowerCase());
  if(!service)return json(request,env,{error:'CHANNEL_SITE_SERVICE_NOT_FOUND'},404);
  if(!canManageChannelSite(identity,subject,service))return json(request,env,{error:'CHANNEL_SITE_FORBIDDEN',serviceId:service.id},403);
  const bindings=await channelSiteBindings(env,subject,{serviceId:service.id});
  return json(request,env,{site:{id:service.id,name:service.name,url:service.url,group:service.group||'',channelAdminUrl:service.channelAdminUrl||''},channels:bindings});
}
async function upsertSiteChannelBinding(request,env,identity,subject,serviceId,channelId){
  const service=channelSiteForId(clean(serviceId,80).toLowerCase());
  if(!service)return json(request,env,{error:'CHANNEL_SITE_SERVICE_NOT_FOUND'},404);
  if(!canManageChannelSite(identity,subject,service))return json(request,env,{error:'CHANNEL_SITE_FORBIDDEN',serviceId:service.id},403);
  const channel=await env.DB.prepare('SELECT id FROM marketing_publish_channels WHERE id=? AND subject_type=? AND subject_key=?').bind(Number(channelId),subject.type,subject.key).first();
  if(!channel)return json(request,env,{error:'CHANNEL_NOT_FOUND'},404);
  const body=await readJson(request)||{};
  if(body.remove===true||body.enabled===false){
    await env.DB.prepare('DELETE FROM channel_site_bindings WHERE subject_type=? AND subject_key=? AND channel_id=? AND service_id=?').bind(subject.type,subject.key,Number(channelId),service.id).run();
    await audit(env,subject,null,'channel_site_binding_removed',`${channelId}:${service.id}`,identity.email);
    return json(request,env,{ok:true,channelId:Number(channelId),serviceId:service.id,removed:true});
  }
  const binding=normalizeChannelSiteBinding({serviceId:service.id,role:body.role,isDefault:body.isDefault,autoArchive:body.autoArchive,archiveCategory:body.archiveCategory,enabled:true,priority:body.priority});
  const now=nowIso();
  const statements=[];
  if(binding.isDefault){
    statements.push(env.DB.prepare('UPDATE channel_site_bindings SET is_default=0,updated_at=? WHERE subject_type=? AND subject_key=? AND service_id=? AND channel_id<>?').bind(now,subject.type,subject.key,service.id,Number(channelId)));
  }
  statements.push(env.DB.prepare(`INSERT INTO channel_site_bindings(subject_type,subject_key,workspace_id,channel_id,service_id,role,is_default,auto_archive,archive_category,enabled,priority,created_by_email,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(subject_type,subject_key,channel_id,service_id) DO UPDATE SET role=excluded.role,is_default=excluded.is_default,auto_archive=excluded.auto_archive,archive_category=excluded.archive_category,enabled=excluded.enabled,priority=excluded.priority,updated_at=excluded.updated_at`)
    .bind(subject.type,subject.key,subject.workspaceId||'',Number(channelId),service.id,binding.role,binding.isDefault?1:0,binding.autoArchive?1:0,binding.archiveCategory,1,binding.priority,identity.email,now,now));
  await env.DB.batch(statements);
  await audit(env,subject,null,'channel_site_binding_updated',`${channelId}:${service.id}:${binding.isDefault?'default':'linked'}:${binding.autoArchive?'archive':'manual'}`,identity.email);
  const rows=await channelSiteBindings(env,subject,{channelId:Number(channelId),serviceId:service.id});
  return json(request,env,{ok:true,channelId:Number(channelId),serviceId:service.id,binding:rows[0]||null});
}
async function resolveSiteChannelIds(env,subject,siteIds=[]) {
  const ids=[];
  for(const raw of siteIds.slice(0,20)){
    const service=channelSiteForId(clean(raw,80).toLowerCase());
    if(!service)throw Object.assign(new Error('CHANNEL_SITE_SERVICE_NOT_FOUND'),{code:'CHANNEL_SITE_SERVICE_NOT_FOUND',status:400});
    const row=await env.DB.prepare(`SELECT c.id FROM channel_site_bindings b JOIN marketing_publish_channels c ON c.id=b.channel_id
      WHERE b.subject_type=? AND b.subject_key=? AND b.service_id=? AND b.enabled=1 AND c.status='active'
      ORDER BY b.is_default DESC,b.priority ASC,b.id ASC LIMIT 1`).bind(subject.type,subject.key,service.id).first();
    if(row?.id)ids.push(Number(row.id));
  }
  return ids;
}

async function listChannels(request, env, subject) {
  const [result,bindings]=await Promise.all([
    env.DB.prepare(`SELECT id,provider,channel_type,display_name,external_account_id,credential_ref,status,config_json,last_check_at,last_error,created_at,updated_at
      FROM marketing_publish_channels WHERE subject_type=? AND subject_key=? ORDER BY id DESC`).bind(subject.type,subject.key).all(),
    channelSiteBindings(env,subject)
  ]);
  const byChannel=new Map();
  for(const binding of bindings){const list=byChannel.get(Number(binding.channel_id))||[];list.push(binding);byChannel.set(Number(binding.channel_id),list)}
  const channels = (result.results || []).map(row => ({...row,credential_ref:row.credential_ref ? 'configured' : '',config:safeParse(row.config_json,{}),siteBindings:byChannel.get(Number(row.id))||[]}));
  return json(request, env, {subject:{type:subject.type,key:subject.key},channels,sites:channelSiteCatalog()});
}

async function connectChannel(request, env, identity, subject) {
  const body = await readJson(request); if (!body) return json(request,env,{error:'INVALID_JSON'},400);
  const entitlement = await automationEntitlement(env,subject);
  if (entitlement.maxChannels < 1) return json(request,env,{error:'CHANNEL_PLAN_UPGRADE_REQUIRED',entitlement},409);
  const provider=clean(body.provider,50).toLowerCase(), channelType=clean(body.channelType,50).toLowerCase(), displayName=clean(body.displayName,120), externalId=clean(body.externalAccountId,160);
  if (!provider || !channelType || !displayName) return json(request,env,{error:'CHANNEL_FIELDS_REQUIRED'},400);
  const existing=await env.DB.prepare('SELECT id FROM marketing_publish_channels WHERE subject_type=? AND subject_key=? AND provider=? AND channel_type=? AND external_account_id=?').bind(subject.type,subject.key,provider,channelType,externalId).first();
  const count=await env.DB.prepare("SELECT count(*) AS n FROM marketing_publish_channels WHERE subject_type=? AND subject_key=? AND status IN ('active','credentials_required','paused')").bind(subject.type,subject.key).first();
  if (!existing && Number(count?.n||0) >= entitlement.maxChannels) return json(request,env,{error:'CHANNEL_PLAN_LIMIT_REACHED',entitlement},409);
  const requestedRef=clean(body.credentialRef,80).toUpperCase();
  const credentialRef=String(env.ALLOW_LEGACY_CHANNEL_SECRET_REF||'false')==='true' ? requestedRef : '';
  if (credentialRef && !/^[A-Z0-9_]{3,80}$/.test(credentialRef)) return json(request,env,{error:'INVALID_CREDENTIAL_REF'},400);
  const hasCredential=Boolean(credentialRef && env[credentialRef]), status=hasCredential?'active':'credentials_required', now=nowIso();
  await env.DB.prepare(`INSERT INTO marketing_publish_channels(subject_type,subject_key,workspace_id,provider,channel_type,display_name,external_account_id,credential_ref,status,config_json,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(subject_type,subject_key,provider,channel_type,external_account_id) DO UPDATE SET workspace_id=excluded.workspace_id,display_name=excluded.display_name,credential_ref=CASE WHEN excluded.credential_ref!='' THEN excluded.credential_ref ELSE marketing_publish_channels.credential_ref END,status=CASE WHEN excluded.credential_ref!='' THEN excluded.status ELSE marketing_publish_channels.status END,config_json=excluded.config_json,updated_at=excluded.updated_at`).bind(subject.type,subject.key,subject.workspaceId||'',provider,channelType,displayName,externalId,credentialRef,status,safeJson(body.config||{}),now,now).run();
  await audit(env,subject,null,'channel_connected',provider+':'+channelType+':'+status,identity.email);
  return json(request,env,{ok:true,status,credentialConfigured:hasCredential,entitlement});
}

function normalizeScheduledAt(value) {
  if (!value) return nowIso();
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return '';
  return new Date(ms).toISOString();
}

async function queuePublish(request, env, identity, subject) {
  const body = await readJson(request);
  if (!body || !body.content) return json(request, env, {error:'CONTENT_REQUIRED'}, 400);
  const requestedChannelIds=Array.isArray(body.channelIds)?body.channelIds:[];
  const requestedSiteIds=Array.isArray(body.siteIds)?[...new Set(body.siteIds.map(value=>clean(value,80).toLowerCase()).filter(Boolean))]:[];
  let siteChannelIds=[];
  try{if(requestedSiteIds.length)siteChannelIds=await resolveSiteChannelIds(env,subject,requestedSiteIds)}
  catch(error){return json(request,env,{error:error.code||'CHANNEL_SITE_RESOLUTION_FAILED'},error.status||400)}
  if(!requestedChannelIds.length&&!siteChannelIds.length)return json(request,env,{error:'CONTENT_AND_CHANNELS_REQUIRED'},400);
  const scheduledAt = normalizeScheduledAt(body.scheduledAt);
  if (!scheduledAt) return json(request, env, {error:'INVALID_SCHEDULE'}, 400);
  const recurrence = ['', 'daily','weekly','monthly'].includes(String(body.recurrenceRule || '')) ? String(body.recurrenceRule || '') : '';
  const scheduleKind = recurrence ? 'repeating' : Date.parse(scheduledAt) <= Date.now() + 5000 ? 'immediate' : 'scheduled';
  const entitlement = await automationEntitlement(env,subject);
  const allowedByPlan = scheduleKind === 'immediate' ? entitlement.immediate : scheduleKind === 'scheduled' ? entitlement.scheduled : scheduleKind === 'repeating' ? entitlement.repeating : entitlement.optimal;
  if (!allowedByPlan) return json(request,env,{error:'CHANNEL_PLAN_SCHEDULE_NOT_ALLOWED',scheduleKind,entitlement},409);
  const policy = await getPolicy(env, subject);
  const requestedBy = body.requestedBy === 'ai' ? 'ai' : 'human';
  if (requestedBy === 'ai') {
    if (!entitlement.autonomous) return json(request,env,{error:'CHANNEL_PLAN_AI_AUTOMATION_REQUIRED',entitlement},409);
    const delegated = policy.mode === 'autonomous';
    const decision = evaluateMissionAction({agentId:'marketing',area:'social_content_publish',reversible:true,delegated,logged:true,preflightVerified:true});
    if (decision.tier !== 'execute_reversible') return json(request, env, {error:'AI_PUBLISH_REQUIRES_DELEGATION',decision}, 409);
  }
  const content = body.content;
  const caption = clean(content.caption, MAX_CAPTION);
  const title = clean(content.title,240);
  if (!caption && !title) return json(request, env, {error:'EMPTY_CONTENT'}, 400);
  const contentType = ['social_post','card_news','short_video','article','notice'].includes(content.contentType) ? content.contentType : 'social_post';
  const source = ['human','ai','imported'].includes(content.source) ? content.source : requestedBy;
  const approvalState = requestedBy === 'human' ? 'approved' : 'auto_approved';
  const now = nowIso();
  const insertContent = await env.DB.prepare(`INSERT INTO marketing_content_items(subject_type,subject_key,workspace_id,title,content_type,caption,asset_url,link_url,content_json,source,approval_state,created_by,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(subject.type,subject.key,subject.workspaceId||'',title,contentType,caption,safeUrl(content.assetUrl),safeUrl(content.linkUrl),safeJson(content.data || {}),source,approvalState,identity.email,now,now).run();
  const contentId = Number(insertContent.meta?.last_row_id || 0);
  if (!contentId) return json(request, env, {error:'CONTENT_INSERT_FAILED'}, 500);

  const ids = [...new Set([...requestedChannelIds,...siteChannelIds].map(Number).filter(Number.isInteger))].slice(0,20);
  if (ids.length > entitlement.maxChannels) return json(request,env,{error:'CHANNEL_PLAN_LIMIT_REACHED',entitlement},409);
  const placeholders = ids.map(()=>'?').join(',');
  const channelResult = await env.DB.prepare(`SELECT id,provider,channel_type,status,credential_ref,config_json FROM marketing_publish_channels WHERE subject_type=? AND subject_key=? AND status='active' AND id IN (${placeholders})`)
    .bind(subject.type,subject.key,...ids).all();
  const channels = channelResult.results || [];
  const jobs = [];
  for (const channel of channels) {
    const control=channelControl(safeParse(channel.config_json,{}));
    const credentialReady=channel.status==='active'&&control.autoPublishEnabled&&await channelCredentialConfigured(env,channel);
    const initial=credentialReady?(scheduleKind==='immediate'?'queued':'scheduled'):'credentials_required';
    const insert=await env.DB.prepare(`INSERT INTO marketing_publication_jobs(subject_type,subject_key,workspace_id,content_id,channel_id,schedule_kind,scheduled_at,recurrence_rule,status,requested_by,attempt_count,max_attempts,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,0,?,?,?)`).bind(subject.type,subject.key,subject.workspaceId||'',contentId,channel.id,scheduleKind,scheduledAt,recurrence,initial,requestedBy,control.maxAttempts,now,now).run();
    const jobId=Number(insert.meta?.last_row_id||0);
    jobs.push({id:jobId,channelId:Number(channel.id),status:initial});
    await audit(env,subject,jobId,'publication_queued',`${channel.provider}:${channel.channel_type}:${scheduledAt}`,identity.email);
  }
  if (!jobs.length) return json(request, env, {error:'NO_OWNED_CHANNELS'}, 400);
  return json(request, env, {ok:true,contentId,scheduleKind,scheduledAt,recurrenceRule:recurrence,jobs,siteIds:requestedSiteIds,entitlement}, 201);
}

// Idempotency-Key: 같은 주체가 같은 키로 다시 요청하면 새 작업을 만들지 않고 처음 응답(작업 id)을 돌려준다.
async function idempotentQueuePublish(request, env, identity, subject) {
  const scope = `marketing-publishing:/v1/publish:${subject.type}:${subject.key}`;
  const claim = await beginIdempotentRequest(env.DB,{scope,key:request.headers.get('idempotency-key')});
  if (claim.state === 'invalid') return json(request,env,{error:'IDEMPOTENCY_KEY_INVALID'},400);
  if (claim.state === 'in_progress') return json(request,env,{error:'IDEMPOTENCY_REQUEST_IN_PROGRESS'},409);
  if (claim.state === 'replay') return json(request,env,{...claim.body,idempotent:true},claim.status);
  let response;
  try { response = await queuePublish(request,env,identity,subject); }
  catch (error) { if (claim.state === 'new') await abandonIdempotentRequest(env.DB,claim.id).catch(()=>{}); throw error; }
  if (claim.state !== 'new') return response;
  if (response.status >= 400 && response.status < 500) { await abandonIdempotentRequest(env.DB,claim.id); return response; }
  const body = await response.clone().json().catch(()=>({}));
  await completeIdempotentRequest(env.DB,claim.id,{jobId:Array.isArray(body.jobs)&&body.jobs[0]?body.jobs[0].id:null,contentId:body.contentId??null,status:response.status,body});
  return response;
}

async function listJobs(request, env, subject) {
  const result = await env.DB.prepare(`SELECT j.id,j.content_id,j.channel_id,j.schedule_kind,j.scheduled_at,j.recurrence_rule,j.status,j.requested_by,j.attempt_count,j.max_attempts,j.next_attempt_at,j.external_post_id,j.external_post_url,j.last_error,j.published_at,j.created_at,j.updated_at,
    c.title,c.content_type,c.caption,ch.provider,ch.channel_type,ch.display_name
    FROM marketing_publication_jobs j JOIN marketing_content_items c ON c.id=j.content_id JOIN marketing_publish_channels ch ON ch.id=j.channel_id
    WHERE j.subject_type=? AND j.subject_key=? ORDER BY j.created_at DESC LIMIT 200`).bind(subject.type,subject.key).all();
  return json(request, env, {jobs:result.results || []});
}

async function mutateJob(request, env, identity, subject, id, action) {
  const job = await env.DB.prepare('SELECT id,status FROM marketing_publication_jobs WHERE id=? AND subject_type=? AND subject_key=?').bind(id,subject.type,subject.key).first();
  if (!job) return json(request, env, {error:'JOB_NOT_FOUND'}, 404);
  if (action === 'cancel') {
    if (['published','cancelled'].includes(job.status)) return json(request, env, {error:'JOB_NOT_CANCELLABLE'}, 409);
    await env.DB.prepare("UPDATE marketing_publication_jobs SET status='cancelled',updated_at=? WHERE id=?").bind(nowIso(),id).run();
    await audit(env, subject, id, 'publication_cancelled', '', identity.email);
    return json(request, env, {ok:true,status:'cancelled'});
  }
  if (action === 'retry') {
    if (!['failed','credentials_required'].includes(job.status)) return json(request, env, {error:'JOB_NOT_RETRYABLE'}, 409);
    await env.DB.prepare("UPDATE marketing_publication_jobs SET status='queued',next_attempt_at=NULL,last_error='',updated_at=? WHERE id=?").bind(nowIso(),id).run();
    await audit(env, subject, id, 'publication_manual_retry', '', identity.email);
    return json(request, env, {ok:true,status:'queued'});
  }
  return json(request, env, {error:'UNKNOWN_ACTION'}, 404);
}

async function channelCredentialConfigured(env, channelOrRef) {
  const channel=channelOrRef&&typeof channelOrRef==='object'?channelOrRef:null;
  if(channel){
    const config=safeParse(channel.config_json,{});
    if(config.credentialMode==='oauth-vault'&&Number(config.oauthConnectionId)>0)return Boolean(env.MARKETING_GROWTH?.publishFromVault);
  }
  const value=String(channel?channel.credential_ref:channelOrRef||'');
  if(!value)return false;
  if(value.startsWith('oauth:')){try{return Boolean(await managedCredential(env,value))}catch{return false}}
  return Boolean(env[value]);
}

async function secretConfig(env, ref) {
  const value=String(ref||'');
  if (value.startsWith('oauth:')) return managedCredential(env,value);
  const raw=value ? env[value] : null;
  if (!raw) throw Object.assign(new Error('채널 인증정보가 연결되지 않았습니다.'),{code:'CREDENTIALS_REQUIRED'});
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(String(raw)); } catch { throw Object.assign(new Error('채널 인증정보 형식이 올바르지 않습니다.'),{code:'INVALID_CREDENTIAL_CONFIG'}); }
}

async function formPost(url, fields) {
  const body = new URLSearchParams();
  for (const [key,value] of Object.entries(fields)) if (value !== undefined && value !== null && value !== '') body.set(key,String(value));
  const response = await fetch(url,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body});
  const data = await response.json().catch(()=>({}));
  if (!response.ok || data.error) throw Object.assign(new Error(data?.error?.message || `Provider HTTP ${response.status}`),{code:'PROVIDER_ERROR',status:response.status});
  return data;
}

async function publishWebhook(job, content, channel, secret) {
  const endpoint = safeUrl(secret.url || secret.endpoint);
  if (!endpoint) throw Object.assign(new Error('Webhook endpoint가 없습니다.'),{code:'INVALID_CREDENTIAL_CONFIG'});
  const headers = {'content-type':'application/json'};
  if (secret.bearerToken) headers.authorization = `Bearer ${secret.bearerToken}`;
  if (secret.headers && typeof secret.headers === 'object') for (const [k,v] of Object.entries(secret.headers)) headers[String(k)] = String(v);
  const response = await fetch(endpoint,{method:'POST',headers,body:JSON.stringify({job:{id:job.id,scheduledAt:job.scheduled_at},content:{title:content.title,type:content.content_type,caption:content.caption,assetUrl:content.asset_url,linkUrl:content.link_url,data:safeParse(content.content_json,{})},channel:{provider:channel.provider,type:channel.channel_type,externalAccountId:channel.external_account_id}})});
  const data = await response.json().catch(()=>({}));
  if (!response.ok) throw Object.assign(new Error(data?.error || `Webhook HTTP ${response.status}`),{code:'PROVIDER_ERROR',status:response.status});
  return {id:clean(data.id || data.post_id,240),url:safeUrl(data.url || data.permalink),response:data};
}

async function publishFacebook(content, secret) {
  const version = clean(secret.graphVersion,20);
  const pageId = clean(secret.pageId,160);
  const accessToken = String(secret.accessToken || '');
  if (!version || !pageId || !accessToken) throw Object.assign(new Error('Meta Page 인증정보가 불완전합니다.'),{code:'INVALID_CREDENTIAL_CONFIG'});
  const base = `https://graph.facebook.com/${encodeURIComponent(version)}/${encodeURIComponent(pageId)}`;
  const payload = safeParse(content.content_json,{});
  if (contentFormat(payload) === 'reel') {
    const reel = await publishFacebookReel({graphVersion:version,pageId,accessToken,videoUrl:content.asset_url || (Array.isArray(payload.assets)?payload.assets[0]:''),description:content.caption,title:content.title});
    return {id:reel.id,url:reel.url,response:reel.response,format:'reel',aiLabel:{isAiGenerated:contentIsAiGenerated(payload),sent:false,reason:'platform_flag_unavailable'}};
  }
  const assets = Array.isArray(payload.assets) ? payload.assets.map(safeUrl).filter(Boolean).slice(0,10) : [];
  let data;
  if (assets.length > 1) {
    const media = [];
    for (const url of assets) {
      const uploaded = await formPost(`${base}/photos`,{url,published:'false',access_token:accessToken});
      if (uploaded.id) media.push(uploaded.id);
    }
    const fields = {message:content.caption,access_token:accessToken};
    media.forEach((id,index)=>{ fields[`attached_media[${index}]`] = JSON.stringify({media_fbid:id}); });
    data = await formPost(`${base}/feed`,fields);
  } else if (content.asset_url || assets[0]) {
    data = await formPost(`${base}/photos`,{url:content.asset_url || assets[0],caption:content.caption,access_token:accessToken});
  } else {
    data = await formPost(`${base}/feed`,{message:content.caption,link:content.link_url,access_token:accessToken});
  }
  const postId = clean(data.post_id || data.id,240);
  return {id:postId,url:canonicalPostUrl({provider:'facebook',id:postId,permalink:absoluteFacebookUrl(data.permalink_url)}),response:data};
}

// Instagram 24시간 게시 한도: 공급자 content_publishing_limit를 먼저 확인하고, 모르면 EKODI 자체 게시 수(50)로 판단한다.
async function instagramQuotaGate(env, row, {graphVersion,igUserId,accessToken}) {
  const quota = await instagramPublishingQuota({graphVersion,igUserId,accessToken});
  const since = new Date(Date.now()-24*60*60*1000).toISOString();
  const local = await env.DB.prepare("SELECT count(*) AS n,MIN(published_at) AS first_at FROM marketing_publication_jobs WHERE channel_id=? AND status='published' AND published_at>=?").bind(Number(row.channel_id||0),since).first().catch(()=>null);
  return instagramQuotaDecision(quota,{localPublished24h:Number(local?.n||0),oldestLocalPublishedAt:local?.first_at||''});
}

async function publishInstagram(content, secret, {env, row = {}} = {}) {
  const version = clean(secret.graphVersion,20);
  const accountId = clean(secret.instagramAccountId,160);
  const accessToken = String(secret.accessToken || '');
  if (!version || !accountId || !accessToken) throw Object.assign(new Error('Instagram Business 인증정보가 불완전합니다.'),{code:'INVALID_CREDENTIAL_CONFIG'});
  const base = `https://graph.facebook.com/${encodeURIComponent(version)}/${encodeURIComponent(accountId)}`;
  const payload = safeParse(content.content_json,{});
  const format = contentFormat(payload);
  const ai = metaAiLabelFields({isAiGenerated:contentIsAiGenerated(payload),version,enabled:String(env?.META_AI_LABEL_ENABLED||'')==='true'});
  if (env?.DB) {
    const gate = await instagramQuotaGate(env,row,{graphVersion:version,igUserId:accountId,accessToken});
    if (!gate.allowed) return {deferred:true,code:gate.code,nextAt:gate.nextAt,message:gate.message};
  }
  if (format === 'reel') {
    const pending = safeParse(row.provider_response_json,{});
    const reel = await publishInstagramReel({graphVersion:version,igUserId:accountId,accessToken,videoUrl:content.asset_url || (Array.isArray(payload.assets)?payload.assets[0]:''),caption:content.caption,extraFields:ai.fields,resumeContainerId:pending.pendingContainerId||'',resumeCreatedAt:pending.pendingCreatedAt||''});
    if (reel.pending) return {pending:true,containerId:reel.containerId,createdAt:reel.createdAt,format:'reel'};
    return {id:reel.id,url:reel.url,response:reel.response,format:'reel',aiLabel:ai.label};
  }
  let assets = Array.isArray(payload.assets) ? payload.assets.map(safeUrl).filter(Boolean).slice(0,10) : [];
  if (!assets.length && content.asset_url) assets = [content.asset_url];
  if (!assets.length) throw Object.assign(new Error('Instagram 게시에는 공개 HTTPS 이미지가 필요합니다.'),{code:'ASSET_REQUIRED'});
  let creationId;
  if (assets.length === 1) {
    const created = await formPost(`${base}/media`,{image_url:assets[0],caption:content.caption,...ai.fields,access_token:accessToken});
    creationId = created.id;
  } else {
    const children = [];
    for (const url of assets) {
      const child = await formPost(`${base}/media`,{image_url:url,is_carousel_item:'true',access_token:accessToken});
      if (child.id) children.push(child.id);
    }
    const parent = await formPost(`${base}/media`,{media_type:'CAROUSEL',children:children.join(','),caption:content.caption,...ai.fields,access_token:accessToken});
    creationId = parent.id;
  }
  if (!creationId) throw Object.assign(new Error('Instagram media container 생성에 실패했습니다.'),{code:'PROVIDER_ERROR'});
  const published = await formPost(`${base}/media_publish`,{creation_id:creationId,access_token:accessToken});
  const permalink = published.id ? await instagramPermalink({graphVersion:version,mediaId:published.id,accessToken}) : '';
  return {id:clean(published.id,240),url:permalink,response:published,format:assets.length>1?'carousel':(format||'photo'),aiLabel:ai.label};
}

async function publishOAuthVault(env, content, channel) {
  const config = safeParse(channel.config_json,{});
  const connectionId = Number(config.oauthConnectionId || 0);
  if (!connectionId) throw Object.assign(new Error('OAuth Vault connection is missing.'),{code:'CREDENTIALS_REQUIRED'});
  if (!env.MARKETING_GROWTH || typeof env.MARKETING_GROWTH.publishFromVault !== 'function') throw Object.assign(new Error('Marketing Growth service binding is missing.'),{code:'SERVICE_BINDING_REQUIRED'});
  const payload = safeParse(content.content_json,{});
  const format = contentFormat(payload);
  const pending = safeParse(content.provider_response_json,{});
  const youtube = payload.youtube && typeof payload.youtube === 'object' ? payload.youtube : {};
  // Phase 7: 포맷·AI 표시·YouTube 공개 범위·IG Reels 이어받기 정보를 함께 넘긴다. 이 필드가 없는 기존 자동 게시는 동작이 같다.
  return env.MARKETING_GROWTH.publishFromVault({
    subject:{type:channel.subject_type,key:channel.subject_key}, connectionId, provider:channel.provider,
    content:{title:content.title,caption:content.caption,imageUrl:content.asset_url,linkUrl:content.link_url,campaignName:payload.campaignName || '',
      format,assets:Array.isArray(payload.assets)?payload.assets.map(safeUrl).filter(Boolean).slice(0,10):[],isAiGenerated:payload.isAiGenerated===true,
      privacyStatus:clean(youtube.privacyStatus||payload.privacyStatus,20),publishAt:clean(youtube.publishAt||payload.publishAt,40),
      resumeContainerId:clean(pending.pendingContainerId,160),resumeCreatedAt:clean(pending.pendingCreatedAt,40),channelId:Number(content.channel_id||0)},
  });
}

async function googleAccessToken(secret) {
  const clientId = String(secret.clientId || secret.client_id || '');
  const clientSecret = String(secret.clientSecret || secret.client_secret || '');
  const refreshToken = String(secret.refreshToken || secret.refresh_token || '');
  if (!clientId || !clientSecret || !refreshToken) throw Object.assign(new Error('YouTube OAuth credential is incomplete.'),{code:'INVALID_CREDENTIAL_CONFIG'});
  const body = new URLSearchParams({client_id:clientId,client_secret:clientSecret,refresh_token:refreshToken,grant_type:'refresh_token'});
  const response = await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body});
  const data = await response.json().catch(()=>({}));
  if (!response.ok || !data.access_token) throw Object.assign(new Error(data.error_description || data.error || 'YouTube OAuth refresh failed'),{code:'PROVIDER_ERROR'});
  return String(data.access_token);
}

async function publishYouTube(content, secret) {
  const payload = safeParse(content.content_json,{});
  const youtube = payload.youtube && typeof payload.youtube === 'object' ? payload.youtube : {};
  const policy = resolveYoutubePrivacy({jobPrivacy:youtube.privacyStatus||payload.privacyStatus,channelPrivacy:secret.privacyStatus,publishAt:youtube.publishAt||payload.publishAt});
  const aiGenerated = contentIsAiGenerated(payload);
  const assetUrl = safeUrl(content.asset_url);
  if (!assetUrl) throw Object.assign(new Error('YouTube upload requires a public HTTPS video URL.'),{code:'ASSET_REQUIRED'});
  const accessToken = await googleAccessToken(secret);
  const asset = await fetch(assetUrl);
  if (!asset.ok) throw Object.assign(new Error(`YouTube asset fetch failed (${asset.status})`),{code:'PROVIDER_ERROR'});
  const contentType = asset.headers.get('content-type') || 'video/mp4';
  const bytes = await asset.arrayBuffer();
  const title = clean(content.title || 'EKODI',100);
  const description = [clean(content.caption,4800),safeUrl(content.link_url)].filter(Boolean).join('\n\n');
  const privacyStatus = policy.privacyStatus;
  const metadata = {snippet:{title,description,categoryId:String(secret.categoryId || '22')},status:{privacyStatus,selfDeclaredMadeForKids:false}};
  if (policy.publishAt) metadata.status.publishAt = policy.publishAt;
  if (aiGenerated) metadata.status.containsSyntheticMedia = true;
  const begin = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',{method:'POST',headers:{authorization:`Bearer ${accessToken}`,'content-type':'application/json; charset=UTF-8','x-upload-content-type':contentType,'x-upload-content-length':String(bytes.byteLength)},body:JSON.stringify(metadata)});
  const beginData = await begin.clone().json().catch(()=>({}));
  const location = begin.headers.get('location');
  if (!begin.ok || !location) throw Object.assign(new Error(beginData?.error?.message || `YouTube resumable start failed (${begin.status})`),{code:'PROVIDER_ERROR'});
  const uploaded = await fetch(location,{method:'PUT',headers:{authorization:`Bearer ${accessToken}`,'content-type':contentType,'content-length':String(bytes.byteLength)},body:bytes});
  const data = await uploaded.json().catch(()=>({}));
  if (!uploaded.ok || !data.id) throw Object.assign(new Error(data?.error?.message || `YouTube upload failed (${uploaded.status})`),{code:'PROVIDER_ERROR'});
  const format = contentFormat(payload);
  return {id:clean(data.id,240),url:canonicalPostUrl({provider:'youtube',id:data.id,format}),response:{id:data.id,privacyStatus,publishAt:policy.publishAt,privacySource:policy.source},format:format||'video',privacyStatus,aiLabel:{isAiGenerated:aiGenerated,sent:aiGenerated,param:aiGenerated?'containsSyntheticMedia':''}};
}

async function executeProvider(env, job, content, channel) {
  const config = safeParse(channel.config_json,{});
  const payload = safeParse(content.content_json,{});
  // AI 생성 콘텐츠가 "AI 미사용" 같은 사실과 다른 주장을 담으면 어떤 채널에도 게시하지 않는다.
  assertAiCaptionHonest(`${content.title || ''}\n${content.caption || ''}`,contentIsAiGenerated(payload));
  if (config.credentialMode === 'oauth-vault' && ['facebook','instagram','threads','youtube'].includes(channel.provider)) return publishOAuthVault(env,content,channel);
  const secret = await secretConfig(env, channel.credential_ref);
  if (channel.provider === 'youtube' && channel.channel_type === 'youtube_short') {
    if (content.content_type !== 'short_video' || !content.asset_url) throw Object.assign(new Error('YouTube Shorts 게시에는 영상 자산이 필요합니다.'),{code:'ASSET_REQUIRED'});
    const youtube = payload.youtube && typeof payload.youtube === 'object' ? payload.youtube : {};
    const policy = resolveYoutubePrivacy({jobPrivacy:youtube.privacyStatus||payload.privacyStatus,channelPrivacy:config.privacyStatus,publishAt:youtube.publishAt||payload.publishAt});
    const aiGenerated = contentIsAiGenerated(payload);
    const result = await uploadYoutubeVideo({env,refreshToken:secret.refreshToken,assetUrl:content.asset_url,title:content.title||'EKODI Shorts',description:content.caption,publishAt:policy.publishAt,privacyStatus:policy.privacyStatus,categoryId:config.categoryId||'22',containsSyntheticMedia:aiGenerated});
    return {...result,url:canonicalPostUrl({provider:'youtube',id:result.id,format:'short',channelType:'youtube_short'}),format:'short',privacyStatus:policy.privacyStatus,aiLabel:{isAiGenerated:aiGenerated,sent:aiGenerated,param:aiGenerated?'containsSyntheticMedia':''}};
  }
  if (channel.provider === 'webhook') return publishWebhook(job,content,channel,secret);
  if ((channel.provider === 'meta' || channel.provider === 'facebook') && channel.channel_type === 'facebook_page') return publishFacebook(content,secret);
  if ((channel.provider === 'meta' || channel.provider === 'instagram') && channel.channel_type === 'instagram_business') return publishInstagram(content,secret,{env,row:job});
  if (channel.provider === 'youtube' && channel.channel_type === 'youtube_channel') return publishYouTube(content,secret);
  throw Object.assign(new Error(`${channel.provider}/${channel.channel_type} provider adapter is not ready.`),{code:'PROVIDER_NOT_READY'});
}
// provider_response_json에는 토큰 없이 게시 결과 요약만 남긴다(포맷·AI 표시·YouTube 공개 범위 포함).
function safeProviderResult(result, format = '') {
  const out = {id:clean(result?.id,240),url:safeUrl(result?.url),ok:true};
  const fmt = clean(result?.format || format,30);
  if (fmt) out.format = fmt;
  if (result?.aiLabel && typeof result.aiLabel === 'object') out.aiLabel = {isAiGenerated:result.aiLabel.isAiGenerated===true,sent:result.aiLabel.sent===true,param:clean(result.aiLabel.param,60),reason:clean(result.aiLabel.reason,80)};
  if (result?.privacyStatus) out.privacyStatus = clean(result.privacyStatus,20);
  if (result?.response?.publishAt) out.publishAt = clean(result.response.publishAt,40);
  if (result?.response?.container_id) out.containerId = clean(result.response.container_id,160);
  if (result?.response?.post_id) out.postId = clean(result.response.post_id,160);
  return out;
}
const NON_RETRYABLE_CODES = new Set(['PROVIDER_NOT_READY','AI_CAPTION_MISLEADING','IG_CONTAINER_ALREADY_PUBLISHED','INVALID_SCHEDULE']);
// 서비스 바인딩(RPC)을 건너온 오류는 code 속성을 잃을 수 있어 메시지 접두어("CODE: …")에서도 읽는다.
function errorCode(error) {
  if (error?.code) return String(error.code);
  const match = /^([A-Z][A-Z0-9_]{2,60}):/.exec(String(error?.message || ''));
  return match ? match[1] : 'PUBLISH_FAILED';
}
const IG_PENDING_MAX_MS = 2*60*60*1000;
async function releaseClaim(env, subject, row, {nextAt, error, providerResponse = null, action, detail}) {
  const sql = providerResponse
    ? "UPDATE marketing_publication_jobs SET status='retrying',attempt_count=MAX(attempt_count-1,0),next_attempt_at=?,last_error=?,provider_response_json=?,updated_at=? WHERE id=? AND status='publishing'"
    : "UPDATE marketing_publication_jobs SET status='retrying',attempt_count=MAX(attempt_count-1,0),next_attempt_at=?,last_error=?,updated_at=? WHERE id=? AND status='publishing'";
  const args = providerResponse ? [nextAt,clean(error,1000),safeJson(providerResponse),nowIso(),row.id] : [nextAt,clean(error,1000),nowIso(),row.id];
  await env.DB.prepare(sql).bind(...args).run();
  await audit(env,subject,row.id,action,detail,'scheduler');
}
function backoffMinutes(attempt) { return [5,15,60,360,1440][Math.min(Math.max(attempt-1,0),4)]; }
function nextRecurrence(value, rule) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  if (rule === 'daily') d.setUTCDate(d.getUTCDate()+1);
  else if (rule === 'weekly') d.setUTCDate(d.getUTCDate()+7);
  else if (rule === 'monthly') d.setUTCMonth(d.getUTCMonth()+1);
  else return null;
  return d.toISOString();
}

function safeIso(value){const ms=Date.parse(String(value||''));return Number.isFinite(ms)?new Date(ms).toISOString():''}
async function deferJob(env,subject,row,code,message,nextAt){
  const when=nextAt||new Date(Date.now()+60*60*1000).toISOString();
  await env.DB.prepare("UPDATE marketing_publication_jobs SET status='retrying',next_attempt_at=?,last_error=?,updated_at=? WHERE id=? AND status IN ('scheduled','queued','retrying')").bind(when,clean(`${code}: ${message}`,1000),nowIso(),row.id).run();
  await audit(env,subject,row.id,'publication_deferred',`${code}:${when}`,'scheduler');
}
async function processJob(env, row) {
  const subject={type:row.subject_type,key:row.subject_key,workspaceId:row.workspace_id||''};
  const policy=await getPolicy(env,subject),allowed=safeParse(policy.allowed_providers_json,[]),control=channelControl(safeParse(row.config_json,{}));
  if(Array.isArray(allowed)&&allowed.length&&!allowed.includes(row.provider))return deferJob(env,subject,row,'POLICY_PROVIDER_BLOCKED','게시 정책에서 허용되지 않은 채널입니다.');
  if(!policyWindowOpen(policy))return deferJob(env,subject,row,'POLICY_TIME_WINDOW','자동 게시 허용 시간 전입니다.',new Date(Date.now()+30*60*1000).toISOString());
  if(row.channel_status!=='active'||!control.autoPublishEnabled)return deferJob(env,subject,row,'CHANNEL_PAUSED','채널 자동 게시가 중지되어 있습니다.');
  if(!timeWindowOpen(control.publishWindowStart,control.publishWindowEnd,control.timezone))return deferJob(env,subject,row,'CHANNEL_TIME_WINDOW','채널 게시 허용 시간 전입니다.',new Date(Date.now()+30*60*1000).toISOString());
  const cutoff=new Date(Date.now()-24*60*60*1000).toISOString();
  const total=await env.DB.prepare("SELECT count(*) AS n,MIN(published_at) AS first_at FROM marketing_publication_jobs WHERE subject_type=? AND subject_key=? AND status='published' AND published_at>=?").bind(subject.type,subject.key,cutoff).first();
  if(Number(total?.n||0)>=Number(policy.max_daily_posts||5))return deferJob(env,subject,row,'DAILY_LIMIT','운영공간 일일 자동 게시 한도에 도달했습니다.',total?.first_at?new Date(Date.parse(total.first_at)+86400000).toISOString():'');
  if(control.maxPostsPerDay>0){
    const per=await env.DB.prepare("SELECT count(*) AS n,MIN(published_at) AS first_at FROM marketing_publication_jobs WHERE channel_id=? AND status='published' AND published_at>=?").bind(row.channel_id,cutoff).first();
    if(Number(per?.n||0)>=control.maxPostsPerDay)return deferJob(env,subject,row,'CHANNEL_DAILY_LIMIT','채널 일일 게시 한도에 도달했습니다.',per?.first_at?new Date(Date.parse(per.first_at)+86400000).toISOString():'');
  }
  if(control.minHoursBetweenPosts>0){
    const last=await env.DB.prepare("SELECT MAX(published_at) AS at FROM marketing_publication_jobs WHERE channel_id=? AND status='published'").bind(row.channel_id).first();
    const nextAt=last?.at?Date.parse(last.at)+control.minHoursBetweenPosts*3600000:0;
    if(nextAt>Date.now())return deferJob(env,subject,row,'CHANNEL_COOLDOWN','채널 최소 게시 간격을 기다리는 중입니다.',new Date(nextAt).toISOString());
  }
  const format=contentFormat(row.content_json);
  const facebookReel=format==='reel'&&(row.provider==='facebook'||(row.provider==='meta'&&row.channel_type==='facebook_page'));
  if(facebookReel){
    // Facebook Page Reels 30개/24시간 소프트 가드(EKODI 게시 기록 기준).
    const reels=await recentPublishedReels(env.DB,row.channel_id,cutoff);
    if(reels.count>=FB_REELS_DAILY_LIMIT)return deferJob(env,subject,row,'FB_REELS_DAILY_LIMIT',`Facebook Page Reels 24시간 한도(${reels.count}/${FB_REELS_DAILY_LIMIT})에 도달했습니다.`,reels.firstAt?new Date(Date.parse(reels.firstAt)+86400000+60000).toISOString():'');
  }
  const claimed=await env.DB.prepare(`UPDATE marketing_publication_jobs SET status='publishing',attempt_count=attempt_count+1,updated_at=? WHERE id=? AND status IN ('scheduled','queued','retrying')`).bind(nowIso(),row.id).run();
  if(!claimed.meta?.changes)return;
  const current=await env.DB.prepare('SELECT attempt_count,max_attempts FROM marketing_publication_jobs WHERE id=?').bind(row.id).first();
  try{
    const result=await executeProvider(env,row,row,row),publishedAt=nowIso();
    if(result?.deferred){
      // 공급자 한도(예: Instagram 24시간 게시 한도)는 실패가 아니다. 시도 횟수를 돌려주고 다음 창으로 미룬다.
      const code=clean(result.code||'PROVIDER_LIMIT',60),nextAt=safeIso(result.nextAt)||new Date(Date.now()+60*60*1000).toISOString();
      return releaseClaim(env,subject,row,{nextAt,error:`${code}: ${clean(result.message||'공급자 게시 한도로 연기',900)}`,action:'publication_deferred',detail:`${code}:${nextAt}`});
    }
    if(result?.pending){
      // Instagram Reels 컨테이너가 아직 처리 중: 크론을 막지 않고 같은 컨테이너를 이어서 확인하도록 다시 예약한다.
      const previous=safeParse(row.provider_response_json,{}),createdAt=safeIso(result.createdAt)||nowIso();
      const firstSeen=safeIso(previous.pendingCreatedAt)&&previous.pendingContainerId===result.containerId?previous.pendingCreatedAt:createdAt;
      if(Date.now()-Date.parse(firstSeen)>IG_PENDING_MAX_MS)throw Object.assign(new Error('Instagram Reels 컨테이너 처리 시간이 2시간을 넘었습니다.'),{code:'IG_CONTAINER_TIMEOUT'});
      const nextAt=new Date(Date.now()+2*60*1000).toISOString();
      return releaseClaim(env,subject,row,{nextAt,error:'IG_MEDIA_PROCESSING: Instagram Reels 영상 처리 대기 중',providerResponse:{pendingContainerId:clean(result.containerId,160),pendingCreatedAt:firstSeen,format:'reel'},action:'publication_media_processing',detail:`${clean(result.containerId,160)}:${nextAt}`});
    }
    const providerResult=safeProviderResult(result,format);
    const postUrl=safeUrl(result.url)||canonicalPostUrl({provider:row.provider,id:result.id,format:providerResult.format||format,channelType:row.channel_type});
    await env.DB.prepare(`UPDATE marketing_publication_jobs SET status='published',external_post_id=?,external_post_url=?,provider_response_json=?,last_error='',published_at=?,updated_at=? WHERE id=?`).bind(clean(result.id,240),postUrl,safeJson({...providerResult,url:postUrl}),publishedAt,publishedAt,row.id).run();
    if(row.variant_id)await markVariantPublished(env.DB,row.variant_id,publishedAt);
    await audit(env,subject,row.id,'publication_published',`${row.provider}:${row.channel_type}:${result.id||'ok'}`,'scheduler');
    const nextAt=nextRecurrence(row.scheduled_at,row.recurrence_rule);
    if(nextAt){
      const now=nowIso();
      await env.DB.prepare(`INSERT INTO marketing_publication_jobs(subject_type,subject_key,workspace_id,content_id,channel_id,schedule_kind,scheduled_at,recurrence_rule,status,requested_by,governance_action_id,attempt_count,max_attempts,created_at,updated_at) VALUES(?,?,?,?,?,'repeating',?,?,'scheduled',?,?,0,?,?,?)`).bind(subject.type,subject.key,subject.workspaceId||'',row.content_id,row.channel_id,nextAt,row.recurrence_rule,row.requested_by,row.governance_action_id||null,row.max_attempts||control.maxAttempts||5,now,now).run();
    }
  }catch(error){
    const code=errorCode(error),attempt=Number(current?.attempt_count||1),max=Number(current?.max_attempts||control.maxAttempts||5);
    const credential=['CREDENTIALS_REQUIRED','INVALID_CREDENTIAL_CONFIG'].includes(code),retryable=!credential&&attempt<max&&!NON_RETRYABLE_CODES.has(code)&&error?.retryable!==false,status=credential?'credentials_required':retryable?'retrying':'failed';
    const next=retryable?new Date(Date.now()+backoffMinutes(attempt)*60000).toISOString():null;
    const message=clean(`${code}: ${String(error?.message||'publish failed').replace(new RegExp('^'+code+':\\s*'),'')}`,1000);
    // 실패·만료된 IG 컨테이너는 다음 시도에서 새로 만든다(이어받기 정보 제거).
    if(['IG_CONTAINER_FAILED','IG_CONTAINER_TIMEOUT'].includes(code))await env.DB.prepare("UPDATE marketing_publication_jobs SET status=?,next_attempt_at=?,last_error=?,provider_response_json='{}',updated_at=? WHERE id=?").bind(status,next,message,nowIso(),row.id).run();
    else await env.DB.prepare('UPDATE marketing_publication_jobs SET status=?,next_attempt_at=?,last_error=?,updated_at=? WHERE id=?').bind(status,next,message,nowIso(),row.id).run();
    await audit(env,subject,row.id,'publication_failed',`${code}:${status}`,'scheduler');
  }
}

async function runScheduler(env) {
  const now = nowIso();
  let result;
  try {
    result = await env.DB.prepare(`SELECT j.*,c.title,c.content_type,c.caption,c.asset_url,c.link_url,c.content_json,ch.provider,ch.channel_type,ch.display_name,ch.external_account_id,ch.credential_ref,ch.config_json,ch.status AS channel_status
      FROM marketing_publication_jobs j JOIN marketing_content_items c ON c.id=j.content_id JOIN marketing_publish_channels ch ON ch.id=j.channel_id
      WHERE j.status IN ('scheduled','queued','retrying') AND ch.status='active' AND j.scheduled_at<=? AND (j.next_attempt_at IS NULL OR j.next_attempt_at<=?)
      ORDER BY j.scheduled_at ASC LIMIT 25`).bind(now,now).all();
  } catch (error) {
    if (/no such table/i.test(String(error?.message || error))) return { processed:0, schemaReady:false };
    throw error;
  }
  const rows = result.results || [];
  for (const row of rows) await processJob(env,row);
  return {processed:rows.length,schemaReady:true};
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const corsInfo = cors(request,env);
    if (request.method === 'OPTIONS') return new Response(null,{status:corsInfo.allowed?204:403,headers:corsInfo.headers});
    if (url.pathname === '/admin' || url.pathname === '/admin/') return Response.redirect('https://admin.ekodi.kr/?route=marketing-ai&source=marketing-publish-api.ekodi.kr',307);
    const baseReady=await schemaReady(env), automationReady=await channelSchemaReady(env), siteBindingReady=await channelSiteBindingSchemaReady(env), serviceBridgeSchema=await channelServiceBridgeSchemaReady(env);
    if (url.pathname === '/health') return json(request,env,{ok:true,service:'ekodi-marketing-publishing',environment:env.ENVIRONMENT || 'unknown',schemaReady:baseReady,channelAutomationCore:automationReady,channelSiteBindings:siteBindingReady,channelServiceBridgeSchema:serviceBridgeSchema,channelServiceBridgeConfigured:channelServiceBridgeReady(env),scheduler:true,personalBrand:true,workspaceIdentity:true,youtubeOAuth:youtubeConnectionReady(env),credentialVault:channelCredentialReady(env),mutations:String(env.ALLOW_MUTATIONS || 'true') !== 'false'});
    if (!baseReady) return json(request,env,{error:'SCHEMA_NOT_READY'},503);
    if (url.pathname.startsWith('/v1/internal/')) {
      if (!automationReady || !serviceBridgeSchema) return json(request,env,{error:'CHANNEL_SERVICE_BRIDGE_NOT_READY'},503);
      if (url.pathname === '/v1/internal/channels' && request.method === 'GET') {
        const result = await listServiceChannels(request,env);
        return json(request,env,result.body,result.status);
      }
      if (url.pathname === '/v1/internal/youtube/schedule' && request.method === 'POST') {
        if (String(env.ALLOW_MUTATIONS || 'true') === 'false') return json(request,env,{error:'STAGING_READ_ONLY'},403);
        try { const result = await scheduleServiceYoutube(request,env); return json(request,env,result.body,result.status); }
        catch(error){ console.error('Channel service schedule',error); return json(request,env,{error:error?.code||'CHANNEL_SERVICE_SCHEDULE_FAILED'},error?.status||500); }
      }
      return json(request,env,{error:'NOT_FOUND'},404);
    }
    if (url.pathname === '/oauth/youtube/callback' && request.method === 'GET') {
      if (String(env.ALLOW_MUTATIONS || 'true') === 'false') return json(request,env,{error:'STAGING_READ_ONLY'},403);
      if (!automationReady) return json(request,env,{error:'CHANNEL_SCHEMA_NOT_READY'},503);
      return handleYoutubeCallback(request,env);
    }
    const write = ['POST','PUT','DELETE'].includes(request.method);
    if (write && String(env.ALLOW_MUTATIONS || 'true') === 'false') return json(request,env,{error:'STAGING_READ_ONLY'},403);
    const auth = await authSubject(request,env,{write});
    if (auth.error) return json(request,env,{error:auth.error},auth.status);
    const {identity,subject} = auth;

    if (url.pathname.startsWith('/v1/automation') || url.pathname.startsWith('/v1/oauth/')) {
      if (!automationReady) return json(request,env,{error:'CHANNEL_SCHEMA_NOT_READY'},503);
    }
    if (url.pathname === '/v1/automation' && request.method === 'GET') return automationSnapshot(request,env,subject);
    if (url.pathname === '/v1/automation/profile' && request.method === 'PUT') {
      const body=await readJson(request); if(!body) return json(request,env,{error:'INVALID_JSON'},400);
      try { const result=await upsertAutomationProfile(env,identity,subject,body); await audit(env,subject,null,'automation_profile_updated',result.templateId,identity.email); return json(request,env,result); }
      catch(error){return json(request,env,{error:error.code||'AUTOMATION_PROFILE_ERROR'},error.status||400)}
    }
    if (url.pathname === '/v1/oauth/connections' && request.method === 'GET') return json(request,env,{connections:await listManagedConnections(env,subject),entitlement:await automationEntitlement(env,subject),youtubeOAuthAvailable:youtubeConnectionReady(env)});
    if (url.pathname === '/v1/oauth/youtube/start' && request.method === 'POST') {
      const entitlement=await automationEntitlement(env,subject); if(entitlement.maxChannels<1) return json(request,env,{error:'CHANNEL_PLAN_UPGRADE_REQUIRED',entitlement},409);
      const body=await readJson(request)||{}; try{return json(request,env,await startYoutubeConnection(env,identity,subject,body),201)}catch(error){return json(request,env,{error:error.code||'YOUTUBE_OAUTH_START_FAILED'},error.status||500)}
    }
    const selectMatch=url.pathname.match(/^\/v1\/oauth\/connections\/([^/]+)\/select$/);
    if(selectMatch && request.method==='POST'){const entitlement=await automationEntitlement(env,subject);try{return json(request,env,await selectYoutubeConnection(request,env,identity,subject,decodeURIComponent(selectMatch[1]),entitlement.maxChannels))}catch(error){return json(request,env,{error:error.code||'CHANNEL_SELECT_FAILED'},error.status||400)}}
    const disconnectMatch=url.pathname.match(/^\/v1\/oauth\/connections\/([^/]+)\/disconnect$/);
    if(disconnectMatch && request.method==='POST'){try{return json(request,env,await disconnectManagedConnection(env,subject,decodeURIComponent(disconnectMatch[1])))}catch(error){return json(request,env,{error:error.code||'CHANNEL_DISCONNECT_FAILED'},error.status||400)}}

    if (url.pathname === '/v1/brand' && request.method === 'GET') return readBrand(request,env,subject);
    if (url.pathname === '/v1/brand' && request.method === 'PUT') return upsertBrand(request,env,identity,subject);
    if (url.pathname === '/v1/policy' && request.method === 'GET') return readPolicy(request,env,subject);
    if (url.pathname === '/v1/policy' && request.method === 'PUT') return upsertPolicy(request,env,identity,subject);
    const channelSiteMatch=url.pathname.match(/^\/v1\/channels\/(\d+)\/sites$/);
    if(channelSiteMatch){
      if(!siteBindingReady)return json(request,env,{error:'CHANNEL_SITE_BINDINGS_NOT_READY'},503);
      if(request.method==='GET')return readChannelSites(request,env,subject,Number(channelSiteMatch[1]));
      if(request.method==='PUT')return replaceChannelSites(request,env,identity,subject,Number(channelSiteMatch[1]));
    }
    const siteChannelsMatch=url.pathname.match(/^\/v1\/sites\/([^/]+)\/channels$/);
    if(siteChannelsMatch&&request.method==='GET'){
      if(!siteBindingReady)return json(request,env,{error:'CHANNEL_SITE_BINDINGS_NOT_READY'},503);
      return listSitePublishingChannels(request,env,identity,subject,decodeURIComponent(siteChannelsMatch[1]));
    }
    const siteChannelBindingMatch=url.pathname.match(/^\/v1\/sites\/([^/]+)\/channels\/(\d+)$/);
    if(siteChannelBindingMatch&&request.method==='PUT'){
      if(!siteBindingReady)return json(request,env,{error:'CHANNEL_SITE_BINDINGS_NOT_READY'},503);
      return upsertSiteChannelBinding(request,env,identity,subject,decodeURIComponent(siteChannelBindingMatch[1]),Number(siteChannelBindingMatch[2]));
    }
    if(url.pathname==='/v1/channel-sites/catalog'&&request.method==='GET'){
      if(!siteBindingReady)return json(request,env,{error:'CHANNEL_SITE_BINDINGS_NOT_READY'},503);
      return json(request,env,{sites:channelSiteCatalog(),bindings:await channelSiteBindings(env,subject)});
    }
    const channelControlMatch=url.pathname.match(/^\/v1\/channels\/(\d+)\/settings$/);
    if(channelControlMatch&&request.method==='PUT')return updateChannelControl(request,env,identity,subject,Number(channelControlMatch[1]));
    if (url.pathname === '/v1/channels' && request.method === 'GET') {
      if(!siteBindingReady)return json(request,env,{error:'CHANNEL_SITE_BINDINGS_NOT_READY'},503);
      return listChannels(request,env,subject);
    }
    if (url.pathname === '/v1/channels' && request.method === 'POST') return connectChannel(request,env,identity,subject);
    if (url.pathname === '/v1/jobs' && request.method === 'GET') return listJobs(request,env,subject);
    if (url.pathname === '/v1/publish' && request.method === 'POST') return idempotentQueuePublish(request,env,identity,subject);
    const jobMatch = url.pathname.match(/^\/v1\/jobs\/(\d+)\/(cancel|retry)$/);
    if (jobMatch && request.method === 'POST') return mutateJob(request,env,identity,subject,Number(jobMatch[1]),jobMatch[2]);
    return json(request,env,{error:'NOT_FOUND'},404);
  },
  async scheduled(event, env, ctx) {
    const tasks = [runScheduler(env)];
    const scheduledAt = new Date(Number(event?.scheduledTime || Date.now()));
    if (scheduledAt.getUTCMinutes() % 20 === 5 && env.MARKETING_GROWTH?.runGrowthCycle) tasks.push(env.MARKETING_GROWTH.runGrowthCycle({reason:'shared-publishing-cron'}));
    // 하루 한 번 OAuth 토큰 상태 점검(Threads 갱신·Meta 재인증 표시). 토큰 복호화 키를 가진 Growth 서비스가 실행한다.
    if (tokenHealthDue(scheduledAt) && env.MARKETING_GROWTH?.runTokenHealth) tasks.push(env.MARKETING_GROWTH.runTokenHealth({reason:'daily-publishing-cron'}));
    ctx.waitUntil(Promise.allSettled(tasks));
  },
};

export { runScheduler, processJob, executeProvider, safeProviderResult, errorCode, nextRecurrence, backoffMinutes, safeUrl };
export const queuePublishForTest = idempotentQueuePublish;
