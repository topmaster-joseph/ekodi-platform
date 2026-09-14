import { automationEntitlement, listAutomationProfiles } from './channel-automation-runtime.js';
import { managedCredential } from './channel-oauth-control.js';
import { uploadYoutubeVideoBytes } from './channel-youtube-adapter.js';

const encoder = new TextEncoder();
const MAX_VIDEO_BYTES = 64 * 1024 * 1024;
const GITHUB_ISSUER = 'https://token.actions.githubusercontent.com';
const GITHUB_AUDIENCE = 'ekodi-channel-service';
const MALL_SERVICE = 'ekodi-mall';
const MALL_REPOSITORY = 'topmaster-joseph/ekodi-mall';
const MALL_REPOSITORY_ID = '1309951804';
const MALL_SUBJECT = 'tenant:ekodimall';
const GITHUB_EVENTS = new Set(['push','workflow_dispatch','schedule']);
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
function decodeBase64Url(value) {
  const normalized = String(value || '').replace(/-/g,'+').replace(/_/g,'/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary,char=>char.charCodeAt(0));
}
function decodeJsonPart(value) { return JSON.parse(new TextDecoder().decode(decodeBase64Url(value))); }
function audienceMatches(aud) { return Array.isArray(aud) ? aud.includes(GITHUB_AUDIENCE) : aud === GITHUB_AUDIENCE; }
export function githubServiceClaimsAllowed(payload = {}) {
  const now = Math.floor(Date.now()/1000);
  return payload.iss === GITHUB_ISSUER
    && audienceMatches(payload.aud)
    && Number(payload.exp || 0) >= now - 30
    && (!payload.nbf || Number(payload.nbf) <= now + 30)
    && (!payload.iat || Number(payload.iat) >= now - 900)
    && String(payload.repository || '') === MALL_REPOSITORY
    && String(payload.repository_id || '') === MALL_REPOSITORY_ID
    && String(payload.ref || '') === 'refs/heads/main'
    && GITHUB_EVENTS.has(String(payload.event_name || ''));
}
async function verifyGithubServiceOidc(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('OIDC_TOKEN_FORMAT_INVALID');
  const [encodedHeader,encodedPayload,encodedSignature] = parts;
  const header = decodeJsonPart(encodedHeader);
  const payload = decodeJsonPart(encodedPayload);
  if (header.alg !== 'RS256' || !header.kid) throw new Error('OIDC_HEADER_INVALID');
  const configResponse = await fetch(`${GITHUB_ISSUER}/.well-known/openid-configuration`,{headers:{accept:'application/json'},cf:{cacheTtl:3600,cacheEverything:true}});
  if (!configResponse.ok) throw new Error(`OIDC_CONFIG_HTTP_${configResponse.status}`);
  const config = await configResponse.json();
  if (config.issuer !== GITHUB_ISSUER || !config.jwks_uri) throw new Error('OIDC_CONFIG_INVALID');
  const jwksResponse = await fetch(config.jwks_uri,{headers:{accept:'application/json'},cf:{cacheTtl:3600,cacheEverything:true}});
  if (!jwksResponse.ok) throw new Error(`OIDC_JWKS_HTTP_${jwksResponse.status}`);
  const jwks = await jwksResponse.json();
  const jwk = Array.isArray(jwks.keys) ? jwks.keys.find(item=>item.kid===header.kid && item.kty==='RSA') : null;
  if (!jwk) throw new Error('OIDC_SIGNING_KEY_NOT_FOUND');
  const key = await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  const signed = encoder.encode(`${encodedHeader}.${encodedPayload}`);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decodeBase64Url(encodedSignature),signed);
  if (!valid) throw new Error('OIDC_SIGNATURE_INVALID');
  if (!githubServiceClaimsAllowed(payload)) throw new Error('OIDC_CLAIMS_INVALID');
  return payload;
}
export async function serviceIdentity(request, env) {
  const service = clean(request.headers.get('x-ekodi-channel-service'),80);
  const auth = String(request.headers.get('authorization') || '');
  if (service === MALL_SERVICE && auth.startsWith('Bearer ')) {
    try {
      const claims = await verifyGithubServiceOidc(auth.slice(7).trim());
      return {service,authMode:'github-oidc',claims};
    } catch { return null; }
  }
  if (!values(env.CHANNEL_AUTOMATION_INTERNAL_SERVICES).has(service)) return null;
  const supplied = String(request.headers.get('x-ekodi-channel-internal-token') || '');
  const expected = String(env[serviceTokenKey(service)] || '');
  if (!constantTimeEqual(supplied,expected)) return null;
  return {service,authMode:'static-token',claims:null};
}
function subjectFrom(request, env, identity) {
  const url = new URL(request.url);
  const type = clean(url.searchParams.get('subject_type'),40).toLowerCase();
  const key = clean(url.searchParams.get('subject_key'),160).toLowerCase();
  if (type !== 'tenant' || !key) return null;
  if (identity?.authMode === 'github-oidc') return `${type}:${key}` === MALL_SUBJECT ? {type,key} : null;
  if (!values(env.CHANNEL_AUTOMATION_INTERNAL_SUBJECTS).has(`${type}:${key}`)) return null;
  return {type,key};
}
async function resolveWorkspaceSubject(env, input) {
  const row = await env.DB.prepare(`SELECT workspace_id FROM marketing_publish_channels
    WHERE subject_type=? AND subject_key=? ORDER BY updated_at DESC LIMIT 1`).bind(input.type,input.key).first();
  const workspaceId = String(row?.workspace_id || '');
  if (!workspaceId) return null;
  return {type:input.type,key:input.key,workspaceId,workspaceSlug:input.key,ownerType:'workspace',ownerKey:workspaceId};
}
async function delegated(env, subject, templateId) {
  const profiles = await listAutomationProfiles(env,subject);
  return profiles.some(profile=>profile.templateId===templateId && profile.enabled);
}
function metadataFrom(request) {
  const raw = String(request.headers.get('x-ekodi-channel-metadata') || '');
  if (!raw || raw.length > 16384) return null;
  try {
    const normalized = raw.replace(/-/g,'+').replace(/_/g,'/');
    const pad = '='.repeat((4-normalized.length%4)%4);
    return JSON.parse(atob(normalized+pad));
  } catch { return null; }
}
export function serviceTemplateAllowed(identity, input, templateId) {
  if (identity?.authMode === 'github-oidc') return identity.service===MALL_SERVICE && `${input?.type}:${input?.key}`===MALL_SUBJECT && templateId==='product_short';
  return templateId === 'devotional_daily';
}
export function serviceModeAllowed(identity, input, templateId, mode = 'scheduled') {
  if (!serviceTemplateAllowed(identity,input,templateId)) return false;
  if (mode === 'scheduled') return true;
  return mode === 'private_proof'
    && identity?.authMode === 'github-oidc'
    && identity?.service === MALL_SERVICE
    && identity?.claims?.event_name === 'workflow_dispatch'
    && `${input?.type}:${input?.key}` === MALL_SUBJECT
    && templateId === 'product_short';
}
export function channelServiceBridgeReady(env = {}) {
  const services = values(env.CHANNEL_AUTOMATION_INTERNAL_SERVICES);
  const staticReady = Boolean(services.size && values(env.CHANNEL_AUTOMATION_INTERNAL_SUBJECTS).size
    && [...services].every(service=>String(env[serviceTokenKey(service)] || '').trim()));
  const mallOidcReady = Boolean(GITHUB_ISSUER && GITHUB_AUDIENCE && MALL_REPOSITORY && MALL_REPOSITORY_ID);
  return staticReady || mallOidcReady;
}
export async function listServiceChannels(request, env) {
  const identity = await serviceIdentity(request,env);
  if (!identity) return {status:401,body:{error:'CHANNEL_SERVICE_AUTH_REQUIRED'}};
  const input = subjectFrom(request,env,identity);
  if (!input) return {status:403,body:{error:'CHANNEL_SERVICE_SUBJECT_FORBIDDEN'}};
  const result = await env.DB.prepare(`SELECT id,provider,channel_type,display_name,external_account_id,status,config_json,last_check_at,last_error,updated_at
    FROM marketing_publish_channels WHERE subject_type=? AND subject_key=? ORDER BY id DESC`).bind(input.type,input.key).all();
  const channels = (result.results || []).map(row=>({
    id:Number(row.id),provider:row.provider,channelType:row.channel_type,displayName:row.display_name,
    externalAccountId:row.external_account_id,status:row.status,config:safeParse(row.config_json,{}),
    lastCheckAt:row.last_check_at,lastError:row.last_error,updatedAt:row.updated_at,
  }));
  return {status:200,body:{service:identity.service,authMode:identity.authMode,subject:input,channels}};
}
async function audit(env, subject, action, detail, actor) {
  await env.DB.prepare(`INSERT INTO marketing_publication_audit(subject_type,subject_key,workspace_id,job_id,action,detail,actor,created_at)
    VALUES(?,?,?,?,?,?,?,?)`).bind(subject.type,subject.key,subject.workspaceId||'',null,action,detail,actor,nowIso()).run();
}
export async function scheduleServiceYoutube(request, env) {
  const identity = await serviceIdentity(request,env);
  if (!identity) return {status:401,body:{error:'CHANNEL_SERVICE_AUTH_REQUIRED'}};
  const input = subjectFrom(request,env,identity);
  if (!input) return {status:403,body:{error:'CHANNEL_SERVICE_SUBJECT_FORBIDDEN'}};
  const meta = metadataFrom(request);
  if (!meta) return {status:400,body:{error:'CHANNEL_SERVICE_METADATA_REQUIRED'}};
  const channelId = Number(meta.channelId || 0);
  const templateId = clean(meta.templateId,80);
  const mode = clean(meta.mode || 'scheduled',40);
  const privateProof = mode === 'private_proof';
  const publishAt = clean(meta.publishAt,80);
  const idempotencyKey = clean(meta.idempotencyKey,160);
  if (!Number.isInteger(channelId) || channelId < 1 || !serviceModeAllowed(identity,input,templateId,mode))
    return {status:400,body:{error:'CHANNEL_SERVICE_TARGET_INVALID'}};
  if (!idempotencyKey) return {status:400,body:{error:'IDEMPOTENCY_KEY_REQUIRED'}};
  if (!privateProof && (!publishAt || !Number.isFinite(Date.parse(publishAt)) || Date.parse(publishAt) <= Date.now()))
    return {status:409,body:{error:'PUBLISH_AT_NOT_FUTURE'}};
  const existing = await env.DB.prepare(`SELECT id,external_post_id,external_post_url,publish_at,status,provider_response_json FROM channel_provider_schedules
    WHERE service_id=? AND subject_type=? AND subject_key=? AND idempotency_key=?`).bind(identity.service,input.type,input.key,idempotencyKey).first();
  if (existing) {
    const response = safeParse(existing.provider_response_json,{});
    return {status:200,body:{ok:true,idempotent:true,mode:response.mode || mode,schedule:{...existing,privacyStatus:response.privacyStatus || ''}}};
  }
  const subject = await resolveWorkspaceSubject(env,input);
  if (!subject) return {status:409,body:{error:'CHANNEL_WORKSPACE_ID_REQUIRED'}};
  const entitlement = await automationEntitlement(env,subject);
  if (!entitlement.scheduled) return {status:409,body:{error:'CHANNEL_PLAN_SCHEDULE_NOT_ALLOWED',entitlement}};
  if (!(await delegated(env,subject,templateId))) return {status:409,body:{error:'CHANNEL_TEMPLATE_DELEGATION_REQUIRED',templateId}};
  const channel = await env.DB.prepare(`SELECT id,provider,channel_type,display_name,external_account_id,credential_ref,status,config_json
    FROM marketing_publish_channels WHERE id=? AND subject_type=? AND subject_key=?`).bind(channelId,input.type,input.key).first();
  if (!channel) return {status:404,body:{error:'CHANNEL_NOT_OWNED'}};
  if (channel.provider !== 'youtube' || channel.channel_type !== 'youtube_short') return {status:400,body:{error:'CHANNEL_SERVICE_PROVIDER_NOT_SUPPORTED'}};
  if (channel.status !== 'active' || !String(channel.credential_ref || '').startsWith('oauth:')) return {status:409,body:{error:'CHANNEL_CONNECTION_RECONNECT_REQUIRED'}};
  let secret;
  try { secret = await managedCredential(env,channel.credential_ref); }
  catch { return {status:409,body:{error:'CHANNEL_CONNECTION_RECONNECT_REQUIRED'}}; }
  if (String(secret?.externalAccountId || '') !== String(channel.external_account_id || '')) return {status:409,body:{error:'YOUTUBE_CHANNEL_BINDING_MISMATCH'}};
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > MAX_VIDEO_BYTES) return {status:413,body:{error:'CHANNEL_VIDEO_TOO_LARGE'}};
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (!bytes.byteLength || bytes.byteLength > MAX_VIDEO_BYTES) return {status:bytes.byteLength?413:400,body:{error:bytes.byteLength?'CHANNEL_VIDEO_TOO_LARGE':'CHANNEL_VIDEO_REQUIRED'}};
  const config = safeParse(channel.config_json,{});
  const providerPublishAt = privateProof ? '' : publishAt;
  const providerPrivacy = privateProof ? 'private' : (config.privacyStatus || 'private');
  const result = await uploadYoutubeVideoBytes({env,refreshToken:secret.refreshToken,bytes,
    contentType:request.headers.get('content-type') || 'video/mp4',title:clean(meta.title,100),description:clean(meta.description,5000),publishAt:providerPublishAt,
    privacyStatus:providerPrivacy,categoryId:config.categoryId || '22',expectedChannelId:channel.external_account_id});
  const now = nowIso();
  const recordPublishAt = privateProof ? now : new Date(publishAt).toISOString();
  const recordStatus = privateProof ? 'published' : 'scheduled';
  const privacyStatus = clean(result.response?.privacyStatus || providerPrivacy,30);
  const providerResponse = {...(result.response||{}),mode,privateProof,privacyStatus};
  const contentInsert = await env.DB.prepare(`INSERT INTO marketing_content_items
    (subject_type,subject_key,workspace_id,title,content_type,caption,asset_url,link_url,content_json,source,approval_state,created_by,created_at,updated_at)
    VALUES(?,?,?,?, 'short_video',?,'','',?,'ai','auto_approved',?,?,?)`)
    .bind(input.type,input.key,subject.workspaceId||'',clean(meta.title,240),clean(meta.description,12000),
      safeJson({templateId,service:identity.service,authMode:identity.authMode,idempotencyKey,providerSchedule:!privateProof,privateProof,mode}),`service:${identity.service}`,now,now).run();
  const contentId = Number(contentInsert.meta?.last_row_id || 0);
  const scheduleInsert = await env.DB.prepare(`INSERT INTO channel_provider_schedules
    (service_id,idempotency_key,subject_type,subject_key,workspace_id,content_id,channel_id,provider,external_post_id,external_post_url,publish_at,status,provider_response_json,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(identity.service,idempotencyKey,input.type,input.key,subject.workspaceId||'',contentId,channelId,'youtube',
      clean(result.id,240),clean(result.url,2048),recordPublishAt,recordStatus,safeJson(providerResponse),now,now).run();
  const scheduleId = Number(scheduleInsert.meta?.last_row_id || 0);
  await env.DB.prepare(`UPDATE marketing_publish_channels SET last_check_at=?,last_error='',updated_at=? WHERE id=?`).bind(now,now,channelId).run();
  const auditAction = privateProof ? 'provider_private_proof_uploaded' : 'provider_schedule_created';
  const auditDetail = privateProof ? `youtube:${result.id}:private` : `youtube:${result.id}:${publishAt}`;
  await audit(env,subject,auditAction,auditDetail,`service:${identity.service}:${identity.authMode}`);
  return {status:201,body:{ok:true,idempotent:false,mode,schedule:{id:scheduleId,contentId,channelId,provider:'youtube',externalPostId:result.id,externalPostUrl:result.url,publishAt:recordPublishAt,status:recordStatus,privacyStatus}}};
}
export async function channelServiceBridgeSchemaReady(env = {}) {
  if (!env.DB) return false;
  try { await env.DB.prepare('SELECT 1 FROM channel_provider_schedules LIMIT 0').all(); return true; }
  catch { return false; }
}
