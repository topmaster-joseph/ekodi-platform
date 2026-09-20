import { d1SchemaReady } from './d1-schema-readiness.js';

const REQUIRED_TABLES = Object.freeze([
  'service_subscriptions',
  'marketing_publish_policies',
  'marketing_publish_channels',
  'marketing_content_items',
  'marketing_publication_jobs',
  'marketing_publication_audit',
]);

export const OWNED_TENANT_AUTOPOST_ROLLOUT = Object.freeze([
  Object.freeze({order:1,subjectType:'tenant',subjectKey:'ekodi-biz',name:'에코디비즈',templateId:'shorts_general'}),
  Object.freeze({order:2,subjectType:'tenant',subjectKey:'jadam',name:'자담치킨 목포대점',templateId:'store_promo'}),
  Object.freeze({order:3,subjectType:'tenant',subjectKey:'pizzamaru',name:'피자마루 목포대점',templateId:'store_promo'}),
  Object.freeze({order:4,subjectType:'tenant',subjectKey:'yogurt',name:'요거트퍼플 목포대점',templateId:'store_promo'}),
]);

const OWNED_TENANT_AUTOPOST_KEYS = new Set(OWNED_TENANT_AUTOPOST_ROLLOUT.map(item=>item.subjectKey));
export function ownedTenantAutopostSubject(subject = {}) {
  return String(subject?.type || '') === 'tenant' && OWNED_TENANT_AUTOPOST_KEYS.has(String(subject?.key || ''));
}

const clean = (value, max = 240) => String(value ?? '').trim().slice(0, max);
const nowIso = () => new Date().toISOString();
function safeParse(value, fallback = {}) { try { return JSON.parse(value || ''); } catch { return fallback; } }
function safeJson(value, fallback = {}) { try { return JSON.stringify(value ?? fallback); } catch { return JSON.stringify(fallback); } }
function httpsUrl(value) {
  const raw = clean(value, 2048);
  if (!raw) return '';
  try { const url = new URL(raw); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; }
}
function channelConfig(row = {}) {
  const config = safeParse(row.config_json,{});
  return {
    autoPublishEnabled: config.autoPublishEnabled !== false,
    maxAttempts: Math.max(1, Math.min(20, Number(config.maxAttempts || 5))),
  };
}

export function autopostContentEligible(row = {}) {
  if (!['approved','auto_approved'].includes(String(row.approval_state || ''))) return false;
  const data = safeParse(row.content_json,{});
  return data.autopostEligible === true && data.autopostDisabled !== true;
}

export function autopostChannelCompatible(content = {}, channel = {}) {
  const provider = clean(channel.provider,40).toLowerCase();
  const type = clean(channel.channel_type,80).toLowerCase();
  const asset = httpsUrl(content.asset_url);
  if (provider === 'youtube') return content.content_type === 'short_video' && Boolean(asset);
  if (provider === 'instagram') return Boolean(asset);
  if (provider === 'facebook' || provider === 'meta' || provider === 'threads' || provider === 'webhook') return true;
  return type === 'facebook_page' && provider === 'meta';
}

async function recentEligibleContent(env, subject, limit = 80) {
  const result = await env.DB.prepare(`SELECT id,title,content_type,caption,asset_url,link_url,content_json,approval_state,updated_at
    FROM marketing_content_items
    WHERE subject_type=? AND subject_key=? AND approval_state IN ('approved','auto_approved')
    ORDER BY updated_at DESC,id DESC LIMIT ?`)
    .bind(subject.subjectType,subject.subjectKey,Math.max(1,Math.min(200,Number(limit)||80))).all();
  return (result.results || []).filter(autopostContentEligible);
}

async function activeChannels(env, subject) {
  const result = await env.DB.prepare(`SELECT id,workspace_id,provider,channel_type,display_name,external_account_id,status,config_json
    FROM marketing_publish_channels
    WHERE subject_type=? AND subject_key=? AND status='active'
    ORDER BY id ASC`).bind(subject.subjectType,subject.subjectKey).all();
  return (result.results || []).filter(row => channelConfig(row).autoPublishEnabled);
}

async function pendingCount(env, subject) {
  const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM marketing_publication_jobs
    WHERE subject_type=? AND subject_key=? AND status IN ('scheduled','queued','publishing','retrying','credentials_required')`)
    .bind(subject.subjectType,subject.subjectKey).first();
  return Number(row?.n || 0);
}

async function subjectStatus(env, subject) {
  const [subscription, policy, channels, content, pending] = await Promise.all([
    env.DB.prepare(`SELECT plan_id,status,provider FROM service_subscriptions
      WHERE subject_type=? AND subject_key=? AND site='marketing' LIMIT 1`)
      .bind(subject.subjectType,subject.subjectKey).first(),
    env.DB.prepare(`SELECT mode,max_daily_posts,allowed_providers_json,quiet_hours_json FROM marketing_publish_policies
      WHERE subject_type=? AND subject_key=? LIMIT 1`)
      .bind(subject.subjectType,subject.subjectKey).first(),
    activeChannels(env,subject),
    recentEligibleContent(env,subject),
    pendingCount(env,subject),
  ]);
  const planReady = subscription?.status === 'active' && ['auto','enterprise'].includes(String(subscription?.plan_id || '').toLowerCase());
  const autonomous = policy?.mode === 'autonomous';
  const allowedProviders = safeParse(policy?.allowed_providers_json,[]);
  const allowedSet = new Set(Array.isArray(allowedProviders) ? allowedProviders.map(item=>clean(item,40).toLowerCase()) : []);
  const usableChannels = channels.filter(row => !allowedSet.size || allowedSet.has(clean(row.provider,40).toLowerCase()));
  let state = 'ready';
  if (!planReady) state = 'plan_required';
  else if (!autonomous) state = 'policy_review';
  else if (!usableChannels.length) state = 'channel_required';
  else if (!content.length) state = 'content_required';
  else if (pending > 0) state = 'pending';
  return {
    order:subject.order,
    subjectType:subject.subjectType,
    subjectKey:subject.subjectKey,
    name:subject.name,
    templateId:subject.templateId,
    state,
    ready:state === 'ready',
    plan:clean(subscription?.plan_id || 'none',30),
    subscriptionStatus:clean(subscription?.status || 'missing',30),
    subscriptionProvider:clean(subscription?.provider || '',40),
    policyMode:clean(policy?.mode || 'missing',30),
    maxDailyPosts:Number(policy?.max_daily_posts || 0),
    activeChannels:channels.length,
    usableChannels:usableChannels.length,
    eligibleContent:content.length,
    pendingJobs:pending,
    explicitContentGate:'content_json.autopostEligible=true',
  };
}

export async function getOwnedTenantAutopostStatus(env) {
  if (!(await d1SchemaReady(env?.DB, REQUIRED_TABLES))) {
    return {ok:false,schemaReady:false,state:'schema_required',rollout:OWNED_TENANT_AUTOPOST_ROLLOUT};
  }
  const subjects = [];
  for (const subject of OWNED_TENANT_AUTOPOST_ROLLOUT) subjects.push(await subjectStatus(env,subject));
  const ready = subjects.filter(item=>item.ready).length;
  const pending = subjects.filter(item=>item.state==='pending').length;
  const blocked = subjects.filter(item=>!['ready','pending','content_required'].includes(item.state)).length;
  return {
    ok:true,
    schemaReady:true,
    generatedAt:nowIso(),
    mode:'approved-content-autopost',
    rolloutOrder:OWNED_TENANT_AUTOPOST_ROLLOUT.map(item=>item.subjectKey),
    safety:{unapprovedContent:false,requiresAutopostEligible:true,paidAds:false,maxQueuedPerTenantPerCycle:1},
    state:blocked ? 'gated' : ready ? 'ready' : pending ? 'pending' : 'waiting_content',
    subjects,
  };
}

async function alreadyScheduled(env, subject, contentId, channelId) {
  const row = await env.DB.prepare(`SELECT id,status FROM marketing_publication_jobs
    WHERE subject_type=? AND subject_key=? AND content_id=? AND channel_id=?
    ORDER BY id DESC LIMIT 1`).bind(subject.subjectType,subject.subjectKey,contentId,channelId).first();
  return row || null;
}

async function queueOne(env, subject, reason) {
  const status = await subjectStatus(env,subject);
  if (!status.ready) return {...status,action:'skipped'};

  const policy = await env.DB.prepare(`SELECT allowed_providers_json FROM marketing_publish_policies
    WHERE subject_type=? AND subject_key=? LIMIT 1`).bind(subject.subjectType,subject.subjectKey).first();
  const allowed = safeParse(policy?.allowed_providers_json,[]);
  const allowedSet = new Set(Array.isArray(allowed) ? allowed.map(item=>clean(item,40).toLowerCase()) : []);
  const channels = (await activeChannels(env,subject))
    .filter(row=>!allowedSet.size || allowedSet.has(clean(row.provider,40).toLowerCase()));
  const content = await recentEligibleContent(env,subject);
  let selected = null;

  outer:
  for (const item of content) {
    for (const channel of channels) {
      if (!autopostChannelCompatible(item,channel)) continue;
      if (await alreadyScheduled(env,subject,item.id,channel.id)) continue;
      selected = {item,channel};
      break outer;
    }
  }
  if (!selected) return {...status,state:'exhausted',ready:false,action:'skipped'};

  const scheduledAt = new Date(Date.now() + 90_000).toISOString();
  const createdAt = nowIso();
  const control = channelConfig(selected.channel);
  try {
    const insert = await env.DB.prepare(`INSERT INTO marketing_publication_jobs(
      subject_type,subject_key,workspace_id,content_id,channel_id,schedule_kind,scheduled_at,recurrence_rule,status,
      requested_by,attempt_count,max_attempts,created_at,updated_at
    ) VALUES(?,?,?,?,?,'scheduled',?,'','scheduled','ai',0,?,?,?)`)
      .bind(subject.subjectType,subject.subjectKey,clean(selected.channel.workspace_id,120),selected.item.id,selected.channel.id,
        scheduledAt,control.maxAttempts,createdAt,createdAt).run();
    const jobId = Number(insert.meta?.last_row_id || 0);
    await env.DB.prepare(`INSERT INTO marketing_publication_audit(
      subject_type,subject_key,workspace_id,job_id,action,detail,actor,created_at
    ) VALUES(?,?,?,?,?,?,?,?)`).bind(
      subject.subjectType,subject.subjectKey,clean(selected.channel.workspace_id,120),jobId,
      'owned_tenant_autopost_queued',
      clean(safeJson({reason,contentId:selected.item.id,channelId:selected.channel.id,provider:selected.channel.provider,templateId:subject.templateId}),1000),
      'ekodi-owned-tenant-autopost',
      createdAt
    ).run();
    return {
      ...status,
      state:'queued',
      ready:false,
      action:'queued',
      jobId,
      contentId:Number(selected.item.id),
      channelId:Number(selected.channel.id),
      provider:clean(selected.channel.provider,40),
      scheduledAt,
    };
  } catch (error) {
    return {...status,state:'queue_failed',ready:false,action:'failed',error:clean(error?.message || error,500)};
  }
}

export async function runOwnedTenantAutopostCycle(env,{reason='shared-publishing-cron'}={}) {
  if (!(await d1SchemaReady(env?.DB, REQUIRED_TABLES))) {
    return {ok:false,status:'schema_required',reason:clean(reason,80),results:[]};
  }
  const results = [];
  for (const subject of OWNED_TENANT_AUTOPOST_ROLLOUT) results.push(await queueOne(env,subject,clean(reason,80)));
  return {
    ok:results.every(item=>item.action!=='failed'),
    status:results.some(item=>item.action==='queued') ? 'queued' : 'idle',
    reason:clean(reason,80),
    rolloutOrder:OWNED_TENANT_AUTOPOST_ROLLOUT.map(item=>item.subjectKey),
    results,
  };
}
