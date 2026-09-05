import { automationEntitlement, listAutomationProfiles } from './channel-automation-runtime.js';
import { managedCredential } from './channel-oauth-control.js';
import { uploadYoutubeVideoBytes } from './channel-youtube-adapter.js';

const encoder = new TextEncoder();
const MAX_VIDEO_BYTES = 64 * 1024 * 1024;
const clean = (value, max = 240) => String(value || '').trim().slice(0, max);
const nowIso = () => new Date().toISOString();
function safeJson(value, fallback = {}) { try { return JSON.stringify(value ?? fallback); } catch { return JSON.stringify(fallback); } }
function safeParse(value, fallback = {}) { try { return JSON.parse(value || ''); } catch { return fallback; } }
function values(value) { return new Set(String(value || '').split(',').map(item => item.trim()).filter(Boolean)); }
function constantTimeEqual(left, right) {
  const a = encoder.encode(String(left || ''));
  const b = encoder.encode(String(right || ''));
  if (!a.length || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}
function serviceTokenKey(service) { return `CHANNEL_AUTOMATION_INTERNAL_TOKEN_${String(service || '').toUpperCase().replace(/[^A-Z0-9]+/g,'_')}`; }
function serviceIdentity(request, env) {
  const service = clean(request.headers.get('x-ekodi-channel-service'), 80);
  if (!values(env.CHANNEL_AUTOMATION_INTERNAL_SERVICES).has(service)) return null;
  const supplied = String(request.headers.get('x-ekodi-channel-internal-token') || '');
  const expected = String(env[serviceTokenKey(service)] || '');
  if (!constantTimeEqual(supplied, expected)) return null;
  return service;
}
function subjectFrom(request, env) {
  const url = new URL(request.url);
  const type = clean(url.searchParams.get('subject_type'), 40).toLowerCase();
  const key = clean(url.searchParams.get('subject_key'), 160).toLowerCase();
  if (type !== 'tenant' || !key) return null;
  if (!values(env.CHANNEL_AUTOMATION_INTERNAL_SUBJECTS).has(`${type}:${key}`)) return null;
  return { type, key };
}
async function resolveWorkspaceSubject(env, input) {
  const row = await env.DB.prepare(`SELECT workspace_id FROM marketing_publish_channels
    WHERE subject_type=? AND subject_key=? ORDER BY updated_at DESC LIMIT 1`).bind(input.type,input.key).first();
  const workspaceId = String(row?.workspace_id || '');
  if (!workspaceId) return null;
  return { type:input.type, key:input.key, workspaceId, workspaceSlug:input.key,
    ownerType:'workspace', ownerKey:workspaceId };
}
async function delegated(env, subject, templateId) {
  const profiles = await listAutomationProfiles(env, subject);
  return profiles.some(profile => profile.templateId === templateId && profile.enabled);
}
function metadataFrom(request) {
  const raw = String(request.headers.get('x-ekodi-channel-metadata') || '');
  if (!raw || raw.length > 16384) return null;
  try {
    const normalized = raw.replace(/-/g,'+').replace(/_/g,'/');
    const pad = '='.repeat((4 - normalized.length % 4) % 4);
    return JSON.parse(atob(normalized + pad));
  } catch { return null; }
}
export function channelServiceBridgeReady(env = {}) {
  const services = values(env.CHANNEL_AUTOMATION_INTERNAL_SERVICES);
  return Boolean(services.size && values(env.CHANNEL_AUTOMATION_INTERNAL_SUBJECTS).size
    && [...services].every(service => String(env[serviceTokenKey(service)] || '').trim()));
}
export async function listServiceChannels(request, env) {
  const service = serviceIdentity(request, env);
  const input = subjectFrom(request, env);
  if (!service) return { status:401, body:{error:'CHANNEL_SERVICE_AUTH_REQUIRED'} };
  if (!input) return { status:403, body:{error:'CHANNEL_SERVICE_SUBJECT_FORBIDDEN'} };
  const result = await env.DB.prepare(`SELECT id,provider,channel_type,display_name,external_account_id,status,config_json,last_check_at,last_error,updated_at
    FROM marketing_publish_channels WHERE subject_type=? AND subject_key=? ORDER BY id DESC`).bind(input.type,input.key).all();
  const channels = (result.results || []).map(row => ({
    id:Number(row.id), provider:row.provider, channelType:row.channel_type,
    displayName:row.display_name, externalAccountId:row.external_account_id,
    status:row.status, config:safeParse(row.config_json,{}), lastCheckAt:row.last_check_at,
    lastError:row.last_error, updatedAt:row.updated_at,
  }));
  return { status:200, body:{service,subject:input,channels} };
}
async function audit(env, subject, action, detail, actor) {
  await env.DB.prepare(`INSERT INTO marketing_publication_audit(subject_type,subject_key,workspace_id,job_id,action,detail,actor,created_at)
    VALUES(?,?,?,?,?,?,?,?)`).bind(subject.type,subject.key,subject.workspaceId||'',null,action,detail,actor,nowIso()).run();
}
export async function scheduleServiceYoutube(request, env) {
  const service = serviceIdentity(request, env);
  const input = subjectFrom(request, env);
  if (!service) return { status:401, body:{error:'CHANNEL_SERVICE_AUTH_REQUIRED'} };
  if (!input) return { status:403, body:{error:'CHANNEL_SERVICE_SUBJECT_FORBIDDEN'} };
  const meta = metadataFrom(request);
  if (!meta) return { status:400, body:{error:'CHANNEL_SERVICE_METADATA_REQUIRED'} };
  const channelId = Number(meta.channelId || 0);
  const templateId = clean(meta.templateId,80);
  const publishAt = clean(meta.publishAt,80);
  const idempotencyKey = clean(meta.idempotencyKey,160);
  if (!Number.isInteger(channelId) || channelId < 1 || templateId !== 'devotional_daily')
    return { status:400, body:{error:'CHANNEL_SERVICE_TARGET_INVALID'} };
  if (!idempotencyKey) return { status:400, body:{error:'IDEMPOTENCY_KEY_REQUIRED'} };
  if (!publishAt || !Number.isFinite(Date.parse(publishAt)) || Date.parse(publishAt) <= Date.now())
    return { status:409, body:{error:'PUBLISH_AT_NOT_FUTURE'} };
  const existing = await env.DB.prepare(`SELECT id,external_post_id,external_post_url,publish_at,status FROM channel_provider_schedules
    WHERE service_id=? AND subject_type=? AND subject_key=? AND idempotency_key=?`).bind(service,input.type,input.key,idempotencyKey).first();
  if (existing) return { status:200, body:{ok:true,idempotent:true,schedule:existing} };
  const subject = await resolveWorkspaceSubject(env,input);
  if (!subject) return { status:409, body:{error:'CHANNEL_WORKSPACE_ID_REQUIRED'} };
  const entitlement = await automationEntitlement(env,subject);
  if (!entitlement.scheduled) return { status:409, body:{error:'CHANNEL_PLAN_SCHEDULE_NOT_ALLOWED',entitlement} };
  if (!(await delegated(env,subject,templateId)))
    return { status:409, body:{error:'CHANNEL_TEMPLATE_DELEGATION_REQUIRED',templateId} };
  const channel = await env.DB.prepare(`SELECT id,provider,channel_type,display_name,external_account_id,credential_ref,status,config_json
    FROM marketing_publish_channels WHERE id=? AND subject_type=? AND subject_key=?`).bind(channelId,input.type,input.key).first();
  if (!channel) return { status:404, body:{error:'CHANNEL_NOT_OWNED'} };
  if (channel.provider !== 'youtube' || channel.channel_type !== 'youtube_short')
    return { status:400, body:{error:'CHANNEL_SERVICE_PROVIDER_NOT_SUPPORTED'} };
  if (channel.status !== 'active' || !String(channel.credential_ref || '').startsWith('oauth:'))
    return { status:409, body:{error:'CHANNEL_CONNECTION_RECONNECT_REQUIRED'} };
  let secret;
  try { secret = await managedCredential(env,channel.credential_ref); }
  catch { return { status:409, body:{error:'CHANNEL_CONNECTION_RECONNECT_REQUIRED'} }; }
  if (String(secret?.externalAccountId || '') !== String(channel.external_account_id || ''))
    return { status:409, body:{error:'YOUTUBE_CHANNEL_BINDING_MISMATCH'} };
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > MAX_VIDEO_BYTES) return { status:413, body:{error:'CHANNEL_VIDEO_TOO_LARGE'} };
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (!bytes.byteLength || bytes.byteLength > MAX_VIDEO_BYTES)
    return { status:bytes.byteLength ? 413 : 400, body:{error:bytes.byteLength ? 'CHANNEL_VIDEO_TOO_LARGE' : 'CHANNEL_VIDEO_REQUIRED'} };
  const config = safeParse(channel.config_json,{});
  const result = await uploadYoutubeVideoBytes({ env, refreshToken:secret.refreshToken,
    bytes, contentType:request.headers.get('content-type') || 'video/mp4',
    title:clean(meta.title,100), description:clean(meta.description,5000), publishAt,
    privacyStatus:config.privacyStatus || 'private', categoryId:config.categoryId || '22',
    expectedChannelId:channel.external_account_id });
  const now = nowIso();
  const contentInsert = await env.DB.prepare(`INSERT INTO marketing_content_items
    (subject_type,subject_key,workspace_id,title,content_type,caption,asset_url,link_url,content_json,source,approval_state,created_by,created_at,updated_at)
    VALUES(?,?,?,?, 'short_video',?,'','',?,'ai','auto_approved',?,?,?)`)
    .bind(input.type,input.key,subject.workspaceId||'',clean(meta.title,240),clean(meta.description,12000),
      safeJson({templateId,service,idempotencyKey,providerSchedule:true}),`service:${service}`,now,now).run();
  const contentId = Number(contentInsert.meta?.last_row_id || 0);
  const scheduleInsert = await env.DB.prepare(`INSERT INTO channel_provider_schedules
    (service_id,idempotency_key,subject_type,subject_key,workspace_id,content_id,channel_id,provider,external_post_id,external_post_url,publish_at,status,provider_response_json,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(service,idempotencyKey,input.type,input.key,subject.workspaceId||'',contentId,channelId,'youtube',
      clean(result.id,240),clean(result.url,2048),new Date(publishAt).toISOString(),'scheduled',safeJson(result.response||{}),now,now).run();
  const scheduleId = Number(scheduleInsert.meta?.last_row_id || 0);
  await env.DB.prepare(`UPDATE marketing_publish_channels SET last_check_at=?,last_error='',updated_at=? WHERE id=?`)
    .bind(now,now,channelId).run();
  await audit(env,subject,'provider_schedule_created',`youtube:${result.id}:${publishAt}`,`service:${service}`);
  return { status:201, body:{ok:true,idempotent:false,schedule:{id:scheduleId,contentId,channelId,
    provider:'youtube',externalPostId:result.id,externalPostUrl:result.url,publishAt:new Date(publishAt).toISOString(),status:'scheduled'}} };
}
export async function channelServiceBridgeSchemaReady(env = {}) {
  if (!env.DB) return false;
  try {
    await env.DB.prepare('SELECT 1 FROM channel_provider_schedules LIMIT 0').all();
    return true;
  } catch { return false; }
}
