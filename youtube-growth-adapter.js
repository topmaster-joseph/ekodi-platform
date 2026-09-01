const SUPABASE_URL = 'https://renzehysxirjilvdxacv.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const WRITE_ROLES = new Set(['store_owner','hq_manager','client_admin','client_editor','manager','owner']);
const SUBJECT_TYPES = new Set(['person','tenant','store']);
const YOUTUBE_PROVIDER = 'youtube';
const YOUTUBE_SCOPES = [
  'https://www.googleapis.com/auth/youtube.force-ssl',
  'https://www.googleapis.com/auth/youtube.upload',
];

const nowIso = () => new Date().toISOString();
const clean = (value, max = 240) => String(value ?? '').trim().slice(0, max);
function safeParse(value, fallback = {}) { try { return JSON.parse(value || ''); } catch { return fallback; } }

function cors(request, env) {
  const origin = String(request.headers.get('origin') || '');
  const configured = String(env.ALLOWED_ORIGINS || '').split(',').map(v => v.trim()).filter(Boolean);
  let allowed = !origin || configured.includes(origin);
  if (!allowed) {
    try {
      const host = new URL(origin).hostname;
      allowed = host === 'admin.ekodi.kr' || host === 'marketing.ekodi.kr' || host === 'my.ekodi.kr' || /^[a-z0-9-]+\.ai\.ekodi\.kr$/i.test(host);
    } catch {}
  }
  const headers = {
    'access-control-allow-headers':'content-type, authorization, idempotency-key',
    'access-control-allow-methods':'GET, POST, OPTIONS',
    'access-control-max-age':'86400',
    vary:'Origin',
  };
  if (origin && allowed) headers['access-control-allow-origin'] = origin;
  return { allowed, headers };
}
function json(request, env, data, status = 200) {
  const { headers } = cors(request, env);
  return new Response(JSON.stringify(data), { status, headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...headers} });
}
async function readJson(request) { try { return await request.json(); } catch { return null; } }

async function identityFromRequest(request) {
  const auth = String(request.headers.get('authorization') || '');
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  if (!token || token.length > 8192) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers:{apikey:SUPABASE_PUBLISHABLE_KEY,authorization:`Bearer ${token}`} });
  if (!response.ok) return null;
  const user = await response.json().catch(() => null);
  const email = String(user?.email || '').trim().toLowerCase();
  if (!user?.id || !email || !user?.email_confirmed_at) return null;
  return { id:String(user.id), email };
}
async function resolveSubject(env, identity, type, key) {
  const subjectType = SUBJECT_TYPES.has(String(type || '').toLowerCase()) ? String(type).toLowerCase() : 'person';
  if (subjectType === 'person') return { type:'person', key:identity.id, role:'owner', writable:true };
  if (subjectType === 'tenant') {
    const slug = clean(key,80).toLowerCase();
    if (!slug) return null;
    const tenant = await env.DB.prepare('SELECT id,slug,status FROM customer_tenants WHERE slug=?').bind(slug).first();
    if (!tenant || tenant.status !== 'active') return null;
    const grant = await env.DB.prepare('SELECT role,enabled FROM customer_access_grants WHERE tenant_id=? AND email=?').bind(tenant.id,identity.email).first();
    if (!grant || Number(grant.enabled) !== 1) return null;
    const role = String(grant.role || '');
    return { type:'tenant', key:String(tenant.slug), role, writable:WRITE_ROLES.has(role) };
  }
  const storeId = clean(key,100);
  if (!storeId) return null;
  const store = await env.DB.prepare('SELECT store_id,tenant_slug,status FROM marketing_store_workspaces WHERE store_id=?').bind(storeId).first();
  if (!store || store.status !== 'active' || !store.tenant_slug) return null;
  const tenant = await env.DB.prepare('SELECT id,slug,status FROM customer_tenants WHERE slug=?').bind(store.tenant_slug).first();
  if (!tenant || tenant.status !== 'active') return null;
  const grant = await env.DB.prepare('SELECT role,enabled FROM customer_access_grants WHERE tenant_id=? AND email=?').bind(tenant.id,identity.email).first();
  if (!grant || Number(grant.enabled) !== 1) return null;
  const role = String(grant.role || '');
  return { type:'store', key:String(store.store_id), role, writable:WRITE_ROLES.has(role) };
}
function subjectParams(url) { return {type:url.searchParams.get('subject_type') || 'person',key:url.searchParams.get('subject_key') || ''}; }
async function authSubject(request, env, write = false) {
  const identity = await identityFromRequest(request);
  if (!identity) return { error:'AUTH_REQUIRED', status:401 };
  const url = new URL(request.url);
  const params = subjectParams(url);
  const subject = await resolveSubject(env,identity,params.type,params.key);
  if (!subject) return { error:'SUBJECT_FORBIDDEN', status:403 };
  if (write && !subject.writable) return { error:'SUBJECT_READ_ONLY', status:403 };
  return { identity, subject };
}

function bytesToBase64(bytes) {
  let value = '';
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value);
}
function base64ToBytes(value) {
  const raw = atob(value);
  return Uint8Array.from(raw, char => char.charCodeAt(0));
}
function vaultSecret(env) {
  return String(env.YOUTUBE_TOKEN_VAULT_SECRET || env.GOOGLE_YOUTUBE_CLIENT_SECRET || '');
}
async function encryptionKey(secret) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`ekodi-youtube-v1:${String(secret || '')}`));
  return crypto.subtle.importKey('raw',digest,{name:'AES-GCM'},false,['encrypt','decrypt']);
}
async function encryptToken(env, token) {
  const secret = vaultSecret(env);
  if (!secret) throw new Error('YOUTUBE_VAULT_SECRET_MISSING');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await encryptionKey(secret);
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(token)));
  return `yt1.${bytesToBase64(iv)}.${bytesToBase64(encrypted)}`;
}
async function decryptToken(env, ciphertext) {
  const secret = vaultSecret(env);
  if (!secret) throw new Error('YOUTUBE_VAULT_SECRET_MISSING');
  const [version,iv64,data64] = String(ciphertext || '').split('.');
  if (version !== 'yt1' || !iv64 || !data64) throw new Error('YOUTUBE_CREDENTIAL_FORMAT_INVALID');
  const key = await encryptionKey(secret);
  const plain = await crypto.subtle.decrypt({name:'AES-GCM',iv:base64ToBytes(iv64)},key,base64ToBytes(data64));
  return new TextDecoder().decode(plain);
}

function youtubeConfigured(env) {
  return Boolean(env.GOOGLE_YOUTUBE_CLIENT_ID && env.GOOGLE_YOUTUBE_CLIENT_SECRET && vaultSecret(env));
}
function randomState() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return bytesToBase64(bytes).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function publicBase(env) { return String(env.PUBLIC_BASE_URL || 'https://marketing-connect-api.ekodi.kr').replace(/\/$/,''); }
function callbackUrl(env) { return `${publicBase(env)}/oauth/youtube/callback`; }
function safeReturnUrl(value) {
  const fallback = 'https://admin.ekodi.kr/';
  const raw = clean(value,2048);
  if (!raw) return fallback;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || !(url.hostname === 'ekodi.kr' || url.hostname.endsWith('.ekodi.kr'))) return fallback;
    url.hash = '';
    return url.href;
  } catch { return fallback; }
}
function redirectResult(returnUrl, params) {
  const url = new URL(safeReturnUrl(returnUrl));
  Object.entries(params).forEach(([key,value]) => url.searchParams.set(key,String(value)));
  return Response.redirect(url.href,302);
}
async function fetchJson(url, init = {}) {
  const response = await fetch(url,init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error) {
    const message = clean(data?.error?.message || data?.error_description || data?.message || `HTTP_${response.status}`,600);
    throw new Error(message || `HTTP_${response.status}`);
  }
  return data;
}
async function createOAuthState(env, identity, subject, returnUrl) {
  const state = randomState();
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  await env.DB.prepare(`INSERT INTO marketing_oauth_states(state,provider,mode,subject_type,subject_key,actor_id,actor_email,return_url,created_at,expires_at)
    VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(state,YOUTUBE_PROVIDER,'publish',subject.type,subject.key,identity.id,identity.email,safeReturnUrl(returnUrl),createdAt,expiresAt).run();
  return state;
}
async function consumeOAuthState(env, state) {
  const row = await env.DB.prepare(`SELECT state,provider,mode,subject_type,subject_key,actor_id,actor_email,return_url,expires_at,used_at
    FROM marketing_oauth_states WHERE state=? AND provider=?`).bind(clean(state,180),YOUTUBE_PROVIDER).first();
  if (!row || row.used_at || Date.parse(row.expires_at) <= Date.now()) return null;
  await env.DB.prepare('UPDATE marketing_oauth_states SET used_at=? WHERE state=? AND used_at IS NULL').bind(nowIso(),row.state).run();
  return row;
}
async function startYoutube(request, env, identity, subject) {
  if (!youtubeConfigured(env)) return json(request,env,{error:'YOUTUBE_APP_NOT_CONFIGURED',setup:'GOOGLE_YOUTUBE_CLIENT_ID + GOOGLE_YOUTUBE_CLIENT_SECRET'},503);
  const body = await readJson(request) || {};
  const state = await createOAuthState(env,identity,subject,body.returnUrl);
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id',String(env.GOOGLE_YOUTUBE_CLIENT_ID));
  url.searchParams.set('redirect_uri',callbackUrl(env));
  url.searchParams.set('response_type','code');
  url.searchParams.set('scope',YOUTUBE_SCOPES.join(' '));
  url.searchParams.set('state',state);
  url.searchParams.set('access_type','offline');
  url.searchParams.set('include_granted_scopes','true');
  url.searchParams.set('prompt','consent');
  if (identity.email) url.searchParams.set('login_hint',identity.email);
  return json(request,env,{authorizationUrl:url.href,provider:'youtube',mode:'publish_upload',scopes:YOUTUBE_SCOPES});
}
async function exchangeCode(env, code) {
  const form = new URLSearchParams({
    client_id:String(env.GOOGLE_YOUTUBE_CLIENT_ID),
    client_secret:String(env.GOOGLE_YOUTUBE_CLIENT_SECRET),
    code,
    redirect_uri:callbackUrl(env),
    grant_type:'authorization_code',
  });
  return fetchJson('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:form});
}
async function refreshAccessToken(env, refreshToken) {
  const form = new URLSearchParams({
    client_id:String(env.GOOGLE_YOUTUBE_CLIENT_ID),
    client_secret:String(env.GOOGLE_YOUTUBE_CLIENT_SECRET),
    refresh_token:refreshToken,
    grant_type:'refresh_token',
  });
  return fetchJson('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:form});
}
async function youtubeChannel(accessToken) {
  const url = new URL('https://www.googleapis.com/youtube/v3/channels');
  url.searchParams.set('part','id,snippet');
  url.searchParams.set('mine','true');
  const data = await fetchJson(url.href,{headers:{authorization:`Bearer ${accessToken}`}});
  const channel = Array.isArray(data.items) ? data.items[0] : null;
  if (!channel?.id) throw new Error('YOUTUBE_CHANNEL_NOT_FOUND');
  return {id:String(channel.id),title:clean(channel.snippet?.title || 'YouTube',120)};
}
async function existingRefreshToken(env, subject, channelId) {
  const row = await env.DB.prepare(`SELECT token_ciphertext FROM marketing_oauth_connections
    WHERE subject_type=? AND subject_key=? AND provider=? AND resource_type='channel' AND external_id=?`)
    .bind(subject.type,subject.key,YOUTUBE_PROVIDER,channelId).first();
  if (!row?.token_ciphertext) return '';
  try { return await decryptToken(env,row.token_ciphertext); } catch { return ''; }
}
async function upsertYoutubeConnection(env, subject, channel, refreshToken, scopes) {
  const ciphertext = await encryptToken(env,refreshToken);
  const now = nowIso();
  await env.DB.prepare(`INSERT INTO marketing_oauth_connections(subject_type,subject_key,provider,resource_type,external_id,display_name,token_ciphertext,token_expires_at,scopes_json,status,metadata_json,last_check_at,last_error,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,NULL,?,'active',?,?, '',?,?)
    ON CONFLICT(subject_type,subject_key,provider,resource_type,external_id) DO UPDATE SET display_name=excluded.display_name,token_ciphertext=excluded.token_ciphertext,token_expires_at=NULL,scopes_json=excluded.scopes_json,status='active',metadata_json=excluded.metadata_json,last_check_at=excluded.last_check_at,last_error='',updated_at=excluded.updated_at`)
    .bind(subject.type,subject.key,YOUTUBE_PROVIDER,'channel',channel.id,channel.title,ciphertext,JSON.stringify(scopes),JSON.stringify({source:'google_oauth',credentialType:'refresh_token'}),now,now,now).run();
  const connection = await env.DB.prepare(`SELECT id FROM marketing_oauth_connections WHERE subject_type=? AND subject_key=? AND provider=? AND resource_type='channel' AND external_id=?`)
    .bind(subject.type,subject.key,YOUTUBE_PROVIDER,channel.id).first();
  if (connection?.id) {
    await env.DB.prepare(`INSERT INTO marketing_publish_channels(subject_type,subject_key,provider,channel_type,display_name,external_account_id,credential_ref,status,config_json,last_check_at,last_error,created_at,updated_at)
      VALUES(?,?,?,?,?,?,'','active',?,?,'',?,?)
      ON CONFLICT(subject_type,subject_key,provider,channel_type,external_account_id) DO UPDATE SET display_name=excluded.display_name,credential_ref='',status='active',config_json=excluded.config_json,last_check_at=excluded.last_check_at,last_error='',updated_at=excluded.updated_at`)
      .bind(subject.type,subject.key,YOUTUBE_PROVIDER,'channel',channel.title,channel.id,JSON.stringify({credentialMode:'oauth-vault',oauthConnectionId:Number(connection.id)}),now,now,now).run();
  }
  return Number(connection?.id || 0);
}
async function youtubeCallback(request, env) {
  const url = new URL(request.url);
  const state = await consumeOAuthState(env,url.searchParams.get('state') || '');
  if (!state) return new Response('Invalid or expired OAuth state',{status:400});
  if (url.searchParams.get('error')) return redirectResult(state.return_url,{ekodi_connect:'error',provider:'youtube',reason:clean(url.searchParams.get('error_description') || url.searchParams.get('error'),160)});
  try {
    const code = clean(url.searchParams.get('code'),4096);
    if (!code) throw new Error('AUTHORIZATION_CODE_MISSING');
    const token = await exchangeCode(env,code);
    if (!token.access_token) throw new Error('YOUTUBE_ACCESS_TOKEN_MISSING');
    const channel = await youtubeChannel(String(token.access_token));
    const subject = {type:state.subject_type,key:state.subject_key};
    const refreshToken = String(token.refresh_token || '') || await existingRefreshToken(env,subject,channel.id);
    if (!refreshToken) throw new Error('YOUTUBE_REFRESH_TOKEN_MISSING');
    const granted = clean(token.scope,4000).split(/\s+/).filter(Boolean);
    const scopes = granted.length ? granted : YOUTUBE_SCOPES;
    const connectionId = await upsertYoutubeConnection(env,subject,channel,refreshToken,scopes);
    return redirectResult(state.return_url,{ekodi_connect:'success',provider:'youtube',connections:connectionId ? 1 : 0});
  } catch (error) {
    return redirectResult(state.return_url,{ekodi_connect:'error',provider:'youtube',reason:clean(error.message,160)});
  }
}

async function youtubeConnection(env, subject, id) {
  let row;
  if (Number.isInteger(Number(id)) && Number(id) > 0) {
    row = await env.DB.prepare(`SELECT id,external_id,display_name,token_ciphertext,scopes_json,status FROM marketing_oauth_connections
      WHERE id=? AND subject_type=? AND subject_key=? AND provider=? AND resource_type='channel'`).bind(Number(id),subject.type,subject.key,YOUTUBE_PROVIDER).first();
  } else {
    const result = await env.DB.prepare(`SELECT id,external_id,display_name,token_ciphertext,scopes_json,status FROM marketing_oauth_connections
      WHERE subject_type=? AND subject_key=? AND provider=? AND resource_type='channel' AND status='active' ORDER BY updated_at DESC LIMIT 2`).bind(subject.type,subject.key,YOUTUBE_PROVIDER).all();
    const rows = result.results || [];
    if (rows.length !== 1) throw new Error(rows.length ? 'YOUTUBE_CONNECTION_ID_REQUIRED' : 'YOUTUBE_CONNECTION_NOT_FOUND');
    row = rows[0];
  }
  if (!row || row.status !== 'active') throw new Error('YOUTUBE_CONNECTION_NOT_FOUND');
  const refreshToken = await decryptToken(env,row.token_ciphertext);
  return {...row,scopes:safeParse(row.scopes_json,[]),refreshToken};
}
function canonicalMallUrl(value) {
  const raw = clean(value,2048);
  if (!raw) throw new Error('MALL_PRODUCT_URL_REQUIRED');
  let url;
  try { url = new URL(raw); } catch { throw new Error('MALL_PRODUCT_URL_INVALID'); }
  if (url.protocol !== 'https:' || url.hostname !== 'ekodi.kr' || !(url.pathname === '/mall' || url.pathname.startsWith('/mall/'))) {
    throw new Error('MALL_PRODUCT_URL_MUST_USE_HTTPS_EKODI_KR_MALL');
  }
  url.hash = '';
  return url.href;
}
function buildProductComment(body) {
  const productName = clean(body.productName,180);
  if (!productName) throw new Error('PRODUCT_NAME_REQUIRED');
  const productUrl = canonicalMallUrl(body.productUrl);
  const lines = ['🛒 영상 속 추천상품',productName,`에코디몰에서 보기: ${productUrl}`,'','제품 정보와 실제 판매처는 에코디몰 상품 페이지에서 확인하세요.'];
  if (body.affiliateDisclosure === true) lines.push('※ 일부 링크를 통한 구매 시 에코디가 수수료를 받을 수 있습니다.');
  return lines.join('\n');
}
function validVideoId(value) {
  const id = clean(value,32);
  if (!/^[A-Za-z0-9_-]{6,24}$/.test(id)) throw new Error('YOUTUBE_VIDEO_ID_INVALID');
  return id;
}
async function postYoutubeComment(request, env, subject) {
  if (!youtubeConfigured(env)) return json(request,env,{error:'YOUTUBE_APP_NOT_CONFIGURED'},503);
  const body = await readJson(request);
  if (!body) return json(request,env,{error:'INVALID_JSON'},400);
  try {
    const connection = await youtubeConnection(env,subject,body.connectionId);
    if (!connection.scopes.includes('https://www.googleapis.com/auth/youtube.force-ssl')) throw new Error('YOUTUBE_COMMENT_SCOPE_REQUIRED');
    const access = await refreshAccessToken(env,connection.refreshToken);
    if (!access.access_token) throw new Error('YOUTUBE_ACCESS_TOKEN_MISSING');
    const videoId = validVideoId(body.videoId);
    const textOriginal = buildProductComment(body);
    let endpoint;
    let payload;
    const parentCommentId = clean(body.parentCommentId,180);
    if (parentCommentId) {
      endpoint = 'https://www.googleapis.com/youtube/v3/comments?part=snippet';
      payload = {snippet:{parentId:parentCommentId,textOriginal}};
    } else {
      endpoint = 'https://www.googleapis.com/youtube/v3/commentThreads?part=snippet';
      payload = {snippet:{videoId,topLevelComment:{snippet:{textOriginal}}}};
    }
    const posted = await fetchJson(endpoint,{method:'POST',headers:{authorization:`Bearer ${access.access_token}`,'content-type':'application/json'},body:JSON.stringify(payload)});
    const commentId = parentCommentId ? String(posted.id || '') : String(posted.snippet?.topLevelComment?.id || posted.id || '');
    return json(request,env,{ok:true,provider:'youtube',channelId:connection.external_id,videoId,commentId,kind:parentCommentId ? 'reply' : 'top_level',productUrl:canonicalMallUrl(body.productUrl)},200);
  } catch (error) {
    const message = clean(error.message,500);
    const status = /REQUIRED|INVALID|MUST_USE/.test(message) ? 400 : /NOT_FOUND|CONNECTION_ID_REQUIRED/.test(message) ? 409 : 502;
    return json(request,env,{error:'YOUTUBE_COMMENT_FAILED',detail:message},status);
  }
}

export function getYoutubeGrowthStatus(env) {
  return {
    configured:youtubeConfigured(env),
    oauthBroker:true,
    encryptedRefreshTokenVault:true,
    commentPublishing:true,
    uploadScopePrepared:true,
    callbackUrl:callbackUrl(env),
    scopes:YOUTUBE_SCOPES,
  };
}

export async function handleYoutubeGrowthRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const isYoutubeRoute = path === '/oauth/youtube/callback' || path === '/v1/connect/youtube/start' || path === '/v1/youtube/comments' || path === '/v1/youtube/status';
  if (!isYoutubeRoute) return null;
  const { allowed, headers } = cors(request,env);
  if (request.method === 'OPTIONS') return new Response(null,{status:allowed ? 204 : 403,headers});
  if (!allowed) return json(request,env,{error:'ORIGIN_FORBIDDEN'},403);
  if (path === '/oauth/youtube/callback' && request.method === 'GET') return youtubeCallback(request,env);
  if (path === '/v1/youtube/status' && request.method === 'GET') return json(request,env,getYoutubeGrowthStatus(env));
  const auth = await authSubject(request,env,true);
  if (auth.error) return json(request,env,{error:auth.error},auth.status);
  if (path === '/v1/connect/youtube/start' && request.method === 'POST') return startYoutube(request,env,auth.identity,auth.subject);
  if (path === '/v1/youtube/comments' && request.method === 'POST') return postYoutubeComment(request,env,auth.subject);
  return json(request,env,{error:'NOT_FOUND'},404);
}
