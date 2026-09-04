import { channelCredentialReady, channelStateHash, decryptChannelCredential, encryptChannelCredential, randomChannelId, randomChannelToken } from './channel-credential-vault.js';
import { exchangeYoutubeCode, listYoutubeChannels, youtubeAuthorizeUrl, youtubeOAuthConfigured } from './channel-youtube-adapter.js';

const nowIso = () => new Date().toISOString();
function clean(value, max = 240) { return String(value || '').trim().slice(0, max); }
function safeJson(value, fallback = {}) { try { return JSON.stringify(value ?? fallback); } catch { return JSON.stringify(fallback); } }
function safeParse(value, fallback = {}) { try { return JSON.parse(value || ''); } catch { return fallback; } }
async function readJson(request) { try { return await request.json(); } catch { return null; } }
function safeReturnTo(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:') return '';
    if (!['my.ekodi.kr','ekodi.kr','marketing.ekodi.kr'].includes(url.hostname)) return '';
    return url.href;
  } catch { return ''; }
}
function owner(subject) { return { type:subject.ownerType || (subject.type === 'person' ? 'person' : 'workspace'), key:subject.ownerKey || subject.workspaceId || subject.key }; }

export function youtubeConnectionReady(env) { return channelCredentialReady(env) && youtubeOAuthConfigured(env); }

export async function listManagedConnections(env, subject) {
  const o = owner(subject);
  const result = await env.DB.prepare(`SELECT id,provider,external_account_id,display_name,scopes,discovered_channels_json,status,last_error,created_at,updated_at FROM channel_oauth_connections WHERE owner_type=? AND owner_key=? ORDER BY updated_at DESC`).bind(o.type,o.key).all();
  return (result.results || []).map(row => ({ id:row.id, provider:row.provider, externalAccountId:row.external_account_id, displayName:row.display_name, scopes:row.scopes, discoveredChannels:safeParse(row.discovered_channels_json,[]), status:row.status, lastError:row.last_error, credentialStored:Boolean(row.external_account_id && row.status === 'active'), createdAt:row.created_at, updatedAt:row.updated_at }));
}
export async function startYoutubeConnection(env, identity, subject, body = {}) {
  if (!youtubeConnectionReady(env)) throw Object.assign(new Error('CHANNEL_YOUTUBE_OAUTH_NOT_CONFIGURED'), { code:'CHANNEL_YOUTUBE_OAUTH_NOT_CONFIGURED', status:503 });
  const o = owner(subject);
  const connectionId = randomChannelId('yt');
  const state = randomChannelToken(32);
  const stateHash = await channelStateHash(state);
  const now = nowIso();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const returnTo = safeReturnTo(body.returnTo);
  await env.DB.prepare(`INSERT INTO channel_oauth_connections(id,owner_type,owner_key,workspace_slug,provider,status,created_by_email,created_at,updated_at) VALUES(?,?,?,?, 'youtube','pending_oauth',?,?,?)`).bind(connectionId,o.type,o.key,subject.workspaceSlug||'',identity.email,now,now).run();
  await env.DB.prepare(`INSERT INTO channel_oauth_states(nonce_hash,connection_id,actor_user_id,actor_email,return_to,expires_at,created_at) VALUES(?,?,?,?,?,?,?)`).bind(stateHash,connectionId,identity.id,identity.email,returnTo,expiresAt,now).run();
  return { connectionId, authorizeUrl:youtubeAuthorizeUrl(env,state,identity.email), expiresAt };
}

function callbackResponse(message, ok = false, returnTo = '', params = {}) {
  if (returnTo) {
    const url = new URL(returnTo);
    Object.entries(params).forEach(([key,value]) => url.searchParams.set(key,String(value)));
    return Response.redirect(url.href, 302);
  }
  const title = ok ? 'YouTube 채널 연결 완료' : 'YouTube 채널 연결 확인 필요';
  const escaped = String(message || '').replace(/[<>&]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]));
  return new Response(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title><body style="font-family:system-ui;padding:32px;max-width:680px;margin:auto"><h1>${title}</h1><p>${escaped}</p><p><a href="https://my.ekodi.kr/">My EKODI로 돌아가기</a></p></body></html>`,{status:ok?200:400,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-frame-options':'DENY'}});
}
export async function handleYoutubeCallback(request, env) {
  const url = new URL(request.url);
  const state = String(url.searchParams.get('state') || '');
  const code = String(url.searchParams.get('code') || '');
  const oauthError = String(url.searchParams.get('error') || '');
  if (!state) return callbackResponse('OAuth state가 없습니다.');
  const hash = await channelStateHash(state);
  const row = await env.DB.prepare(`SELECT s.*,c.owner_type,c.owner_key,c.status AS connection_status FROM channel_oauth_states s JOIN channel_oauth_connections c ON c.id=s.connection_id WHERE s.nonce_hash=?`).bind(hash).first();
  if (!row || Date.parse(row.expires_at) <= Date.now()) return callbackResponse('연결 요청이 만료되었거나 이미 사용되었습니다.');
  await env.DB.prepare('DELETE FROM channel_oauth_states WHERE nonce_hash=?').bind(hash).run();
  if (oauthError || !code) {
    await env.DB.prepare("UPDATE channel_oauth_connections SET status='error',last_error=?,updated_at=? WHERE id=?").bind(clean(oauthError || 'OAUTH_CODE_MISSING',500),nowIso(),row.connection_id).run();
    return callbackResponse('Google 승인이 완료되지 않았습니다.',false,row.return_to,{channel_connection:row.connection_id,status:'error'});
  }
  try {
    const tokens = await exchangeYoutubeCode(env, code);
    if (!tokens.refresh_token) throw Object.assign(new Error('YOUTUBE_REFRESH_TOKEN_MISSING'), { code:'YOUTUBE_REFRESH_TOKEN_MISSING' });
    const channels = await listYoutubeChannels(tokens.access_token);
    if (!channels.length) throw Object.assign(new Error('YOUTUBE_CHANNEL_NOT_FOUND'), { code:'YOUTUBE_CHANNEL_NOT_FOUND' });
    const encrypted = await encryptChannelCredential(env,{refreshToken:String(tokens.refresh_token),tokenType:String(tokens.token_type||'Bearer'),scope:String(tokens.scope||''),connectedAt:nowIso()});
    const status = channels.length === 1 ? 'selection_required' : 'selection_required';
    await env.DB.prepare(`UPDATE channel_oauth_connections SET credential_ciphertext=?,credential_iv=?,scopes=?,discovered_channels_json=?,status=?,last_error='',updated_at=? WHERE id=?`).bind(encrypted.ciphertext,encrypted.iv,String(tokens.scope||''),safeJson(channels,[]),status,nowIso(),row.connection_id).run();
    return callbackResponse('Google 연결이 완료되었습니다. 게시할 YouTube 채널을 선택해 주세요.',true,row.return_to,{channel_connection:row.connection_id,status:'selection_required'});
  } catch (error) {
    await env.DB.prepare("UPDATE channel_oauth_connections SET status='error',last_error=?,updated_at=? WHERE id=?").bind(clean(`${error?.code||'OAUTH_CALLBACK'}:${error?.message||'failed'}`,500),nowIso(),row.connection_id).run();
    return callbackResponse('YouTube 채널 연결을 완료하지 못했습니다.',false,row.return_to,{channel_connection:row.connection_id,status:'error'});
  }
}
export async function selectYoutubeConnection(request, env, identity, subject, connectionId, maxChannels) {
  if (Number(maxChannels || 0) < 1) throw Object.assign(new Error('CHANNEL_PLAN_UPGRADE_REQUIRED'), { code:'CHANNEL_PLAN_UPGRADE_REQUIRED', status:409 });
  const body = await readJson(request);
  const externalId = clean(body?.externalAccountId,160);
  if (!externalId) throw Object.assign(new Error('YOUTUBE_CHANNEL_ID_REQUIRED'), { code:'YOUTUBE_CHANNEL_ID_REQUIRED', status:400 });
  const o = owner(subject);
  const row = await env.DB.prepare('SELECT * FROM channel_oauth_connections WHERE id=? AND owner_type=? AND owner_key=? AND provider=\'youtube\'').bind(connectionId,o.type,o.key).first();
  if (!row) throw Object.assign(new Error('CHANNEL_CONNECTION_NOT_FOUND'), { code:'CHANNEL_CONNECTION_NOT_FOUND', status:404 });
  if (!row.credential_ciphertext || !row.credential_iv) throw Object.assign(new Error('CHANNEL_OAUTH_INCOMPLETE'), { code:'CHANNEL_OAUTH_INCOMPLETE', status:409 });
  const discovered = safeParse(row.discovered_channels_json,[]);
  const selected = discovered.find(item => String(item.id) === externalId);
  if (!selected) throw Object.assign(new Error('YOUTUBE_CHANNEL_NOT_DISCOVERED'), { code:'YOUTUBE_CHANNEL_NOT_DISCOVERED', status:400 });
  const existing = await env.DB.prepare(`SELECT id FROM marketing_publish_channels WHERE subject_type=? AND subject_key=? AND provider='youtube' AND channel_type='youtube_short' AND external_account_id=?`).bind(subject.type,subject.key,externalId).first();
  const count = await env.DB.prepare(`SELECT count(*) AS n FROM marketing_publish_channels WHERE subject_type=? AND subject_key=? AND status IN ('active','credentials_required','paused')`).bind(subject.type,subject.key).first();
  if (!existing && Number(count?.n || 0) >= Number(maxChannels)) throw Object.assign(new Error('CHANNEL_PLAN_LIMIT_REACHED'), { code:'CHANNEL_PLAN_LIMIT_REACHED', status:409 });
  const now = nowIso();
  await env.DB.prepare(`UPDATE channel_oauth_connections SET external_account_id=?,display_name=?,status='active',last_error='',updated_at=? WHERE id=?`).bind(externalId,clean(selected.title,120),now,connectionId).run();
  await env.DB.prepare(`INSERT INTO marketing_publish_channels(subject_type,subject_key,workspace_id,provider,channel_type,display_name,external_account_id,credential_ref,status,config_json,created_at,updated_at) VALUES(?,?,?,'youtube','youtube_short',?,?,?,'active',?,?,?) ON CONFLICT(subject_type,subject_key,provider,channel_type,external_account_id) DO UPDATE SET workspace_id=excluded.workspace_id,display_name=excluded.display_name,credential_ref=excluded.credential_ref,status='active',updated_at=excluded.updated_at`).bind(subject.type,subject.key,subject.workspaceId||'',clean(selected.title,120),externalId,`oauth:${connectionId}`,safeJson({privacyStatus:'private',shorts:true}),now,now).run();
  return { ok:true, connectionId, externalAccountId:externalId, displayName:clean(selected.title,120), status:'active' };
}
export async function disconnectManagedConnection(env, subject, connectionId) {
  const o = owner(subject);
  const row = await env.DB.prepare('SELECT id FROM channel_oauth_connections WHERE id=? AND owner_type=? AND owner_key=?').bind(connectionId,o.type,o.key).first();
  if (!row) throw Object.assign(new Error('CHANNEL_CONNECTION_NOT_FOUND'), { code:'CHANNEL_CONNECTION_NOT_FOUND', status:404 });
  const now = nowIso();
  await env.DB.prepare("UPDATE channel_oauth_connections SET credential_ciphertext='',credential_iv='',status='revoked',updated_at=? WHERE id=?").bind(now,connectionId).run();
  await env.DB.prepare("UPDATE marketing_publish_channels SET status='paused',updated_at=? WHERE subject_type=? AND subject_key=? AND credential_ref=?").bind(now,subject.type,subject.key,`oauth:${connectionId}`).run();
  return { ok:true, status:'revoked' };
}

export async function managedCredential(env, ref) {
  const value = String(ref || '');
  if (!value.startsWith('oauth:')) return null;
  const id = value.slice('oauth:'.length);
  const row = await env.DB.prepare("SELECT * FROM channel_oauth_connections WHERE id=? AND status='active'").bind(id).first();
  if (!row) throw Object.assign(new Error('CHANNEL_CONNECTION_RECONNECT_REQUIRED'), { code:'CREDENTIALS_REQUIRED' });
  const secret = await decryptChannelCredential(env,row);
  return { ...secret, connectionId:id, provider:row.provider, externalAccountId:row.external_account_id, displayName:row.display_name };
}
