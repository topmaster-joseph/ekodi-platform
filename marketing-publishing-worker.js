import { evaluateMissionAction } from './ai-governance-runtime.js';
import { CHANNEL_AUTOMATION_TEMPLATES, channelAutomationEntitlement } from './channel-automation-policy.js';
import { channelCredentialReady, channelStateHash, decryptChannelCredential, encryptChannelCredential, randomChannelId, randomChannelToken } from './channel-credential-vault.js';
import { exchangeYoutubeCode, listYoutubeChannels, uploadYoutubeVideo, youtubeAuthorizeUrl, youtubeOAuthConfigured } from './channel-youtube-adapter.js';
import { channelAutomationActor, resolveChannelAutomationSubject } from './channel-automation-subject.js';
import { automationEntitlement, listAutomationProfiles, upsertAutomationProfile } from './channel-automation-runtime.js';
import { disconnectManagedConnection, handleYoutubeCallback, listManagedConnections, managedCredential, selectYoutubeConnection, startYoutubeConnection, youtubeConnectionReady } from './channel-oauth-control.js';
import { channelServiceBridgeReady, channelServiceBridgeSchemaReady, listServiceChannels, scheduleServiceYoutube } from './channel-service-bridge.js';

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

async function automationSnapshot(request,env,subject) {
  const entitlement=await automationEntitlement(env,subject);
  const [profiles,connections,channels,jobs]=await Promise.all([
    listAutomationProfiles(env,subject),
    listManagedConnections(env,subject),
    env.DB.prepare('SELECT id,provider,channel_type,display_name,external_account_id,status,config_json,last_check_at,last_error,created_at,updated_at FROM marketing_publish_channels WHERE subject_type=? AND subject_key=? ORDER BY id DESC').bind(subject.type,subject.key).all(),
    env.DB.prepare('SELECT id,channel_id,schedule_kind,scheduled_at,recurrence_rule,status,requested_by,external_post_url,last_error,published_at,created_at FROM marketing_publication_jobs WHERE subject_type=? AND subject_key=? ORDER BY created_at DESC LIMIT 50').bind(subject.type,subject.key).all(),
  ]);
  return json(request,env,{subject:{type:subject.type,key:subject.key,workspaceId:subject.workspaceId||'',workspaceSlug:subject.workspaceSlug||''},entitlement,profiles,connections,channels:(channels.results||[]).map(row=>({...row,config:safeParse(row.config_json,{})})),jobs:jobs.results||[],youtubeOAuthAvailable:youtubeConnectionReady(env)});
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

async function listChannels(request, env, subject) {
  const result = await env.DB.prepare(`SELECT id,provider,channel_type,display_name,external_account_id,credential_ref,status,config_json,last_check_at,last_error,created_at,updated_at
    FROM marketing_publish_channels WHERE subject_type=? AND subject_key=? ORDER BY id DESC`).bind(subject.type,subject.key).all();
  const channels = (result.results || []).map(row => ({...row,credential_ref:row.credential_ref ? 'configured' : '',config:safeParse(row.config_json,{})}));
  return json(request, env, {subject:{type:subject.type,key:subject.key},channels});
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
  if (!body || !body.content || !Array.isArray(body.channelIds) || !body.channelIds.length) return json(request, env, {error:'CONTENT_AND_CHANNELS_REQUIRED'}, 400);
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

  const ids = [...new Set(body.channelIds.map(Number).filter(Number.isInteger))].slice(0,20);
  if (ids.length > entitlement.maxChannels) return json(request,env,{error:'CHANNEL_PLAN_LIMIT_REACHED',entitlement},409);
  const placeholders = ids.map(()=>'?').join(',');
  const channelResult = await env.DB.prepare(`SELECT id,provider,channel_type,status,credential_ref,config_json FROM marketing_publish_channels WHERE subject_type=? AND subject_key=? AND id IN (${placeholders})`)
    .bind(subject.type,subject.key,...ids).all();
  const channels = channelResult.results || [];
  const jobs = [];
  for (const channel of channels) {
    const credentialReady = channel.status === 'active' && await channelCredentialConfigured(env,channel.credential_ref);
    const initial = credentialReady ? (scheduleKind === 'immediate' ? 'queued' : 'scheduled') : 'credentials_required';
    const insert = await env.DB.prepare(`INSERT INTO marketing_publication_jobs(subject_type,subject_key,workspace_id,content_id,channel_id,schedule_kind,scheduled_at,recurrence_rule,status,requested_by,attempt_count,max_attempts,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,0,5,?,?)`).bind(subject.type,subject.key,subject.workspaceId||'',contentId,channel.id,scheduleKind,scheduledAt,recurrence,initial,requestedBy,now,now).run();
    const jobId = Number(insert.meta?.last_row_id || 0);
    jobs.push({id:jobId,channelId:Number(channel.id),status:initial});
    await audit(env, subject, jobId, 'publication_queued', `${channel.provider}:${channel.channel_type}:${scheduledAt}`, identity.email);
  }
  if (!jobs.length) return json(request, env, {error:'NO_OWNED_CHANNELS'}, 400);
  return json(request, env, {ok:true,contentId,scheduleKind,scheduledAt,recurrenceRule:recurrence,jobs,entitlement}, 201);
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

async function channelCredentialConfigured(env, ref) {
  const value=String(ref||'');
  if (!value) return false;
  if (value.startsWith('oauth:')) { try { return Boolean(await managedCredential(env,value)); } catch { return false; } }
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
  return {id:clean(data.id || data.post_id,240),url:'',response:data};
}

async function publishInstagram(content, secret) {
  const version = clean(secret.graphVersion,20);
  const accountId = clean(secret.instagramAccountId,160);
  const accessToken = String(secret.accessToken || '');
  if (!version || !accountId || !accessToken) throw Object.assign(new Error('Instagram Business 인증정보가 불완전합니다.'),{code:'INVALID_CREDENTIAL_CONFIG'});
  const base = `https://graph.facebook.com/${encodeURIComponent(version)}/${encodeURIComponent(accountId)}`;
  const payload = safeParse(content.content_json,{});
  let assets = Array.isArray(payload.assets) ? payload.assets.map(safeUrl).filter(Boolean).slice(0,10) : [];
  if (!assets.length && content.asset_url) assets = [content.asset_url];
  if (!assets.length) throw Object.assign(new Error('Instagram 게시에는 공개 HTTPS 이미지가 필요합니다.'),{code:'ASSET_REQUIRED'});
  let creationId;
  if (assets.length === 1) {
    const created = await formPost(`${base}/media`,{image_url:assets[0],caption:content.caption,access_token:accessToken});
    creationId = created.id;
  } else {
    const children = [];
    for (const url of assets) {
      const child = await formPost(`${base}/media`,{image_url:url,is_carousel_item:'true',access_token:accessToken});
      if (child.id) children.push(child.id);
    }
    const parent = await formPost(`${base}/media`,{media_type:'CAROUSEL',children:children.join(','),caption:content.caption,access_token:accessToken});
    creationId = parent.id;
  }
  if (!creationId) throw Object.assign(new Error('Instagram media container 생성에 실패했습니다.'),{code:'PROVIDER_ERROR'});
  const published = await formPost(`${base}/media_publish`,{creation_id:creationId,access_token:accessToken});
  let permalink = '';
  if (published.id) {
    const response = await fetch(`https://graph.facebook.com/${encodeURIComponent(version)}/${encodeURIComponent(published.id)}?fields=permalink&access_token=${encodeURIComponent(accessToken)}`);
    const detail = await response.json().catch(()=>({}));
    if (response.ok) permalink = safeUrl(detail.permalink);
  }
  return {id:clean(published.id,240),url:permalink,response:published};
}

async function publishOAuthVault(env, content, channel) {
  const config = safeParse(channel.config_json,{});
  const connectionId = Number(config.oauthConnectionId || 0);
  if (!connectionId) throw Object.assign(new Error('OAuth Vault connection is missing.'),{code:'CREDENTIALS_REQUIRED'});
  if (!env.MARKETING_GROWTH || typeof env.MARKETING_GROWTH.publishFromVault !== 'function') throw Object.assign(new Error('Marketing Growth service binding is missing.'),{code:'SERVICE_BINDING_REQUIRED'});
  return env.MARKETING_GROWTH.publishFromVault({
    subject:{type:channel.subject_type,key:channel.subject_key}, connectionId, provider:channel.provider,
    content:{title:content.title,caption:content.caption,imageUrl:content.asset_url,linkUrl:content.link_url,campaignName:safeParse(content.content_json,{}).campaignName || ''},
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
  const assetUrl = safeUrl(content.asset_url);
  if (!assetUrl) throw Object.assign(new Error('YouTube upload requires a public HTTPS video URL.'),{code:'ASSET_REQUIRED'});
  const accessToken = await googleAccessToken(secret);
  const asset = await fetch(assetUrl);
  if (!asset.ok) throw Object.assign(new Error(`YouTube asset fetch failed (${asset.status})`),{code:'PROVIDER_ERROR'});
  const contentType = asset.headers.get('content-type') || 'video/mp4';
  const bytes = await asset.arrayBuffer();
  const title = clean(content.title || 'EKODI',100);
  const description = [clean(content.caption,4800),safeUrl(content.link_url)].filter(Boolean).join('\n\n');
  const privacyStatus = ['private','unlisted','public'].includes(String(secret.privacyStatus || '')) ? String(secret.privacyStatus) : 'private';
  const metadata = {snippet:{title,description,categoryId:String(secret.categoryId || '22')},status:{privacyStatus,selfDeclaredMadeForKids:false}};
  const begin = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',{method:'POST',headers:{authorization:`Bearer ${accessToken}`,'content-type':'application/json; charset=UTF-8','x-upload-content-type':contentType,'x-upload-content-length':String(bytes.byteLength)},body:JSON.stringify(metadata)});
  const beginData = await begin.clone().json().catch(()=>({}));
  const location = begin.headers.get('location');
  if (!begin.ok || !location) throw Object.assign(new Error(beginData?.error?.message || `YouTube resumable start failed (${begin.status})`),{code:'PROVIDER_ERROR'});
  const uploaded = await fetch(location,{method:'PUT',headers:{authorization:`Bearer ${accessToken}`,'content-type':contentType,'content-length':String(bytes.byteLength)},body:bytes});
  const data = await uploaded.json().catch(()=>({}));
  if (!uploaded.ok || !data.id) throw Object.assign(new Error(data?.error?.message || `YouTube upload failed (${uploaded.status})`),{code:'PROVIDER_ERROR'});
  return {id:clean(data.id,240),url:`https://www.youtube.com/watch?v=${encodeURIComponent(data.id)}`,response:{id:data.id,privacyStatus}};
}

async function executeProvider(env, job, content, channel) {
  const config = safeParse(channel.config_json,{});
  if (config.credentialMode === 'oauth-vault' && ['facebook','instagram','threads','youtube'].includes(channel.provider)) return publishOAuthVault(env,content,channel);
  const secret = await secretConfig(env, channel.credential_ref);
  if (channel.provider === 'youtube' && channel.channel_type === 'youtube_short') {
    if (content.content_type !== 'short_video' || !content.asset_url) throw Object.assign(new Error('YouTube Shorts 게시에는 영상 자산이 필요합니다.'),{code:'ASSET_REQUIRED'});
    return uploadYoutubeVideo({env,refreshToken:secret.refreshToken,assetUrl:content.asset_url,title:content.title||'EKODI Shorts',description:content.caption,privacyStatus:config.privacyStatus||'private',categoryId:config.categoryId||'22'});
  }
  if (channel.provider === 'webhook') return publishWebhook(job,content,channel,secret);
  if ((channel.provider === 'meta' || channel.provider === 'facebook') && channel.channel_type === 'facebook_page') return publishFacebook(content,secret);
  if ((channel.provider === 'meta' || channel.provider === 'instagram') && channel.channel_type === 'instagram_business') return publishInstagram(content,secret);
  if (channel.provider === 'youtube' && channel.channel_type === 'youtube_channel') return publishYouTube(content,secret);
  throw Object.assign(new Error(`${channel.provider}/${channel.channel_type} provider adapter is not ready.`),{code:'PROVIDER_NOT_READY'});
}
function safeProviderResult(result) {
  return {id:clean(result?.id,240),url:safeUrl(result?.url),ok:true};
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

async function processJob(env, row) {
  const subject = {type:row.subject_type,key:row.subject_key,workspaceId:row.workspace_id||''};
  const claimed = await env.DB.prepare(`UPDATE marketing_publication_jobs SET status='publishing',attempt_count=attempt_count+1,updated_at=?
    WHERE id=? AND status IN ('scheduled','queued','retrying')`).bind(nowIso(),row.id).run();
  if (!claimed.meta?.changes) return;
  const current = await env.DB.prepare('SELECT attempt_count,max_attempts FROM marketing_publication_jobs WHERE id=?').bind(row.id).first();
  try {
    const policy = await getPolicy(env, subject);
    const allowed = safeParse(policy.allowed_providers_json,[]);
    if (Array.isArray(allowed) && allowed.length && !allowed.includes(row.provider)) throw Object.assign(new Error('게시 정책에서 허용되지 않은 채널입니다.'),{code:'POLICY_PROVIDER_BLOCKED'});
    const cutoff = new Date(Date.now()-24*60*60*1000).toISOString();
    const count = await env.DB.prepare("SELECT count(*) AS n FROM marketing_publication_jobs WHERE subject_type=? AND subject_key=? AND status='published' AND published_at>=?").bind(subject.type,subject.key,cutoff).first();
    if (Number(count?.n || 0) >= Number(policy.max_daily_posts || 5)) throw Object.assign(new Error('일일 자동 게시 한도에 도달했습니다.'),{code:'DAILY_LIMIT'});
    const result = await executeProvider(env,row,row,row);
    const publishedAt = nowIso();
    await env.DB.prepare(`UPDATE marketing_publication_jobs SET status='published',external_post_id=?,external_post_url=?,provider_response_json=?,last_error='',published_at=?,updated_at=? WHERE id=?`)
      .bind(clean(result.id,240),safeUrl(result.url),safeJson(safeProviderResult(result)),publishedAt,publishedAt,row.id).run();
    await audit(env,subject,row.id,'publication_published',`${row.provider}:${row.channel_type}:${result.id || 'ok'}`,'scheduler');
    const nextAt = nextRecurrence(row.scheduled_at,row.recurrence_rule);
    if (nextAt) {
      const now = nowIso();
      await env.DB.prepare(`INSERT INTO marketing_publication_jobs(subject_type,subject_key,workspace_id,content_id,channel_id,schedule_kind,scheduled_at,recurrence_rule,status,requested_by,governance_action_id,attempt_count,max_attempts,created_at,updated_at)
        VALUES(?,?,?,?,?, 'repeating',?,?, 'scheduled',?,?,0,?,?,?)`)
        .bind(subject.type,subject.key,subject.workspaceId||'',row.content_id,row.channel_id,nextAt,row.recurrence_rule,row.requested_by,row.governance_action_id || null,row.max_attempts || 5,now,now).run();
    }
  } catch (error) {
    const code = String(error?.code || 'PUBLISH_FAILED');
    const attempt = Number(current?.attempt_count || 1);
    const max = Number(current?.max_attempts || 5);
    const credential = ['CREDENTIALS_REQUIRED','INVALID_CREDENTIAL_CONFIG'].includes(code);
    const retryable = !credential && attempt < max && !['PROVIDER_NOT_READY','POLICY_PROVIDER_BLOCKED'].includes(code);
    const status = credential ? 'credentials_required' : retryable ? 'retrying' : 'failed';
    const next = retryable ? new Date(Date.now()+backoffMinutes(attempt)*60*1000).toISOString() : null;
    await env.DB.prepare('UPDATE marketing_publication_jobs SET status=?,next_attempt_at=?,last_error=?,updated_at=? WHERE id=?')
      .bind(status,next,clean(`${code}: ${error?.message || 'publish failed'}`,1000),nowIso(),row.id).run();
    await audit(env,subject,row.id,'publication_failed',`${code}:${status}`,'scheduler');
  }
}

async function runScheduler(env) {
  const now = nowIso();
  let result;
  try {
    result = await env.DB.prepare(`SELECT j.*,c.title,c.content_type,c.caption,c.asset_url,c.link_url,c.content_json,ch.provider,ch.channel_type,ch.display_name,ch.external_account_id,ch.credential_ref,ch.config_json,ch.status AS channel_status
      FROM marketing_publication_jobs j JOIN marketing_content_items c ON c.id=j.content_id JOIN marketing_publish_channels ch ON ch.id=j.channel_id
      WHERE j.status IN ('scheduled','queued','retrying') AND j.scheduled_at<=? AND (j.next_attempt_at IS NULL OR j.next_attempt_at<=?)
      ORDER BY j.scheduled_at ASC LIMIT 25`).bind(now,now).all();
  } catch (error) {
    if (/no such table/i.test(String(error?.message || error))) return { processed:0, schemaReady:false };
    throw error;
  }
  const rows = result.results || [];
  for (const row of rows) await processJob(env,row);
  return {processed:rows.length,schemaReady:true};
}

async function growthServiceProbe(env) {
  if (!env.MARKETING_GROWTH || typeof env.MARKETING_GROWTH.healthProbe !== 'function') return {ready:false,error:'SERVICE_BINDING_REQUIRED'};
  try {
    const result = await env.MARKETING_GROWTH.healthProbe();
    return {ready:Boolean(result?.ok && result?.schemaReady),service:clean(result?.service,80),entrypoint:clean(result?.entrypoint,80),schemaReady:Boolean(result?.schemaReady),error:''};
  } catch (error) { return {ready:false,error:clean(error?.message || error,300)}; }
}

async function runSharedGrowthCycle(env) {
  if (!env.MARKETING_GROWTH || typeof env.MARKETING_GROWTH.runGrowthCycle !== 'function') throw new Error('MARKETING_GROWTH_SERVICE_BINDING_REQUIRED');
  try {
    const result = await env.MARKETING_GROWTH.runGrowthCycle({reason:'shared-publishing-cron'});
    if (!result?.ok) console.error('EKODI Mall growth cycle returned non-ok', safeJson(result,{}));
    return result;
  } catch (error) { console.error('EKODI Mall growth cycle failed', String(error?.message || error)); throw error; }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const corsInfo = cors(request,env);
    if (request.method === 'OPTIONS') return new Response(null,{status:corsInfo.allowed?204:403,headers:corsInfo.headers});
    if (url.pathname === '/admin' || url.pathname === '/admin/') return Response.redirect('https://admin.ekodi.kr/?route=marketing-ai&source=marketing-publish-api.ekodi.kr',307);
    const baseReady=await schemaReady(env), automationReady=await channelSchemaReady(env), serviceBridgeSchema=await channelServiceBridgeSchemaReady(env);
    if (url.pathname === '/health') { const growthService=await growthServiceProbe(env); return json(request,env,{ok:true,service:'ekodi-marketing-publishing',environment:env.ENVIRONMENT || 'unknown',schemaReady:baseReady,channelAutomationCore:automationReady,channelServiceBridgeSchema:serviceBridgeSchema,channelServiceBridgeConfigured:channelServiceBridgeReady(env),scheduler:true,growthServiceBinding:growthService.ready,growthService,personalBrand:true,workspaceIdentity:true,youtubeOAuth:youtubeConnectionReady(env),credentialVault:channelCredentialReady(env),mutations:String(env.ALLOW_MUTATIONS || 'true') !== 'false'}); }
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
    if (url.pathname === '/v1/policy' && request.method === 'PUT') return upsertPolicy(request,env,identity,subject);
    if (url.pathname === '/v1/channels' && request.method === 'GET') return listChannels(request,env,subject);
    if (url.pathname === '/v1/channels' && request.method === 'POST') return connectChannel(request,env,identity,subject);
    if (url.pathname === '/v1/jobs' && request.method === 'GET') return listJobs(request,env,subject);
    if (url.pathname === '/v1/publish' && request.method === 'POST') return queuePublish(request,env,identity,subject);
    const jobMatch = url.pathname.match(/^\/v1\/jobs\/(\d+)\/(cancel|retry)$/);
    if (jobMatch && request.method === 'POST') return mutateJob(request,env,identity,subject,Number(jobMatch[1]),jobMatch[2]);
    return json(request,env,{error:'NOT_FOUND'},404);
  },
  async scheduled(event, env, ctx) {
    const tasks = [runScheduler(env)];
    const scheduledAt = new Date(Number(event?.scheduledTime || Date.now()));
    if (scheduledAt.getUTCMinutes() === 5) tasks.push(runSharedGrowthCycle(env));
    ctx.waitUntil(Promise.allSettled(tasks));
  },
};

export { runScheduler, nextRecurrence, backoffMinutes, safeUrl };
