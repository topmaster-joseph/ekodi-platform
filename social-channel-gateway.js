import authWorker from './auth-worker.js';

const PROVIDERS = new Set(['facebook', 'instagram', 'youtube']);
const POST_STATES = new Set(['draft', 'scheduled', 'publishing', 'published', 'failed', 'cancelled']);
const EVENT_TYPES = new Set(['click', 'view', 'lead', 'add_to_cart', 'checkout', 'purchase']);
const META_DEFAULT_SCOPES = 'pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish';
const YOUTUBE_SCOPES = 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly';

const nowIso = () => new Date().toISOString();
const text = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const uid = (prefix = 'soc') => `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers }
  });
}

async function readJson(request) {
  try { return await request.json(); } catch { return null; }
}

async function adminSession(request, env) {
  const url = new URL(request.url);
  url.pathname = '/api/session';
  url.search = '';
  const response = await authWorker.fetch(new Request(url.toString(), { method: 'GET', headers: request.headers }), env);
  if (!response.ok) return { response };
  return { response, session: await response.clone().json() };
}

async function ensureSchema(db) {
  if (!db) throw new Error('DB_NOT_CONFIGURED');
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS social_connections (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, provider TEXT NOT NULL, provider_account_id TEXT NOT NULL,
      account_name TEXT NOT NULL DEFAULT '', account_handle TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'connected',
      token_ciphertext TEXT NOT NULL, token_expires_at TEXT, scopes TEXT NOT NULL DEFAULT '', metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL DEFAULT '', UNIQUE(tenant_id, provider, provider_account_id)
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_social_connections_tenant ON social_connections(tenant_id, provider, status)'),
    db.prepare(`CREATE TABLE IF NOT EXISTS social_oauth_states (
      state_hash TEXT PRIMARY KEY, provider TEXT NOT NULL, tenant_id TEXT NOT NULL, return_url TEXT NOT NULL DEFAULT '',
      requested_by TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, expires_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS social_campaigns (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, name TEXT NOT NULL, destination_url TEXT NOT NULL,
      utm_campaign TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, created_by TEXT NOT NULL DEFAULT ''
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS social_posts (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, campaign_id TEXT, connection_id TEXT NOT NULL, provider TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'draft', message TEXT NOT NULL DEFAULT '', title TEXT NOT NULL DEFAULT '', asset_url TEXT NOT NULL DEFAULT '',
      asset_type TEXT NOT NULL DEFAULT '', destination_url TEXT NOT NULL DEFAULT '', tracked_url TEXT NOT NULL DEFAULT '', utm_content TEXT NOT NULL DEFAULT '',
      scheduled_at TEXT, published_at TEXT, provider_post_id TEXT NOT NULL DEFAULT '', provider_url TEXT NOT NULL DEFAULT '',
      attempt_count INTEGER NOT NULL DEFAULT 0, last_error_code TEXT NOT NULL DEFAULT '', last_error_message TEXT NOT NULL DEFAULT '',
      metadata_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, created_by TEXT NOT NULL DEFAULT '',
      FOREIGN KEY(connection_id) REFERENCES social_connections(id)
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_social_posts_queue ON social_posts(state, scheduled_at)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_social_posts_tenant ON social_posts(tenant_id, created_at DESC)'),
    db.prepare(`CREATE TABLE IF NOT EXISTS social_publish_attempts (
      id TEXT PRIMARY KEY, post_id TEXT NOT NULL, attempt_no INTEGER NOT NULL, status TEXT NOT NULL, provider_http_status INTEGER,
      provider_object_id TEXT NOT NULL DEFAULT '', error_code TEXT NOT NULL DEFAULT '', error_message TEXT NOT NULL DEFAULT '',
      started_at TEXT NOT NULL, finished_at TEXT NOT NULL, FOREIGN KEY(post_id) REFERENCES social_posts(id)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS social_post_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT, post_id TEXT NOT NULL, provider TEXT NOT NULL, metric_name TEXT NOT NULL,
      metric_value REAL NOT NULL DEFAULT 0, collected_at TEXT NOT NULL, UNIQUE(post_id, metric_name, collected_at)
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_social_metrics_post ON social_post_metrics(post_id, collected_at DESC)'),
    db.prepare(`CREATE TABLE IF NOT EXISTS social_events (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, post_id TEXT, campaign_id TEXT, event_type TEXT NOT NULL,
      value REAL NOT NULL DEFAULT 0, currency TEXT NOT NULL DEFAULT '', anonymous_id TEXT NOT NULL DEFAULT '', referrer TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_social_events_post ON social_events(post_id, event_type, created_at DESC)'),
    db.prepare(`CREATE TABLE IF NOT EXISTS social_learnings (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, provider TEXT NOT NULL DEFAULT '', pattern_key TEXT NOT NULL,
      summary TEXT NOT NULL, evidence_json TEXT NOT NULL DEFAULT '{}', confidence REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(tenant_id, provider, pattern_key)
    )`)
  ]);
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value)));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function bytesToBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}
async function tokenKey(env) {
  if (!env.SOCIAL_TOKEN_KEY) throw new Error('SOCIAL_TOKEN_KEY_NOT_CONFIGURED');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(env.SOCIAL_TOKEN_KEY));
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
async function encryptTokens(env, value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await tokenKey(env), new TextEncoder().encode(JSON.stringify(value)));
  return `v1.${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(encrypted))}`;
}
async function decryptTokens(env, value) {
  const [version, iv64, data64] = String(value).split('.');
  if (version !== 'v1' || !iv64 || !data64) throw new Error('INVALID_TOKEN_CIPHERTEXT');
  const clear = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(iv64) }, await tokenKey(env), base64ToBytes(data64));
  return JSON.parse(new TextDecoder().decode(clear));
}

function validHttpsUrl(value, field = 'url', optional = false) {
  const raw = text(value, 2000);
  if (!raw && optional) return '';
  let url;
  try { url = new URL(raw); } catch { throw new Error(`${field}_INVALID`); }
  if (url.protocol !== 'https:') throw new Error(`${field}_HTTPS_REQUIRED`);
  return url.toString();
}
function safeReturnUrl(value, env) {
  const fallback = 'https://admin.ekodi.kr/#social';
  if (!value) return fallback;
  const url = new URL(value);
  const allowed = new Set(['admin.ekodi.kr', ...String(env.SOCIAL_RETURN_HOSTS || '').split(',').map(v => v.trim()).filter(Boolean)]);
  return url.protocol === 'https:' && allowed.has(url.hostname) ? url.toString() : fallback;
}
function appendUtm(destination, provider, campaign, content) {
  if (!destination) return '';
  const url = new URL(destination);
  url.searchParams.set('utm_source', provider);
  url.searchParams.set('utm_medium', 'social');
  if (campaign) url.searchParams.set('utm_campaign', campaign);
  if (content) url.searchParams.set('utm_content', content);
  return url.toString();
}

async function providerJson(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.error?.message || body?.error_description || `PROVIDER_HTTP_${response.status}`);
    error.status = response.status;
    error.code = body?.error?.code || body?.error || `HTTP_${response.status}`;
    error.body = body;
    throw error;
  }
  return { body, response };
}

function metaVersion(env) { return text(env.META_GRAPH_VERSION || 'v24.0', 16); }
function metaBase(env) { return `https://graph.facebook.com/${metaVersion(env)}`; }

async function exchangeMetaCode(env, code, redirectUri) {
  if (!env.META_APP_ID || !env.META_APP_SECRET) throw new Error('META_OAUTH_NOT_CONFIGURED');
  const url = new URL(`${metaBase(env)}/oauth/access_token`);
  url.search = new URLSearchParams({ client_id: env.META_APP_ID, client_secret: env.META_APP_SECRET, redirect_uri: redirectUri, code }).toString();
  return (await providerJson(url)).body;
}
async function exchangeGoogleCode(env, code, redirectUri) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) throw new Error('GOOGLE_OAUTH_NOT_CONFIGURED');
  return (await providerJson('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, code, grant_type: 'authorization_code', redirect_uri: redirectUri })
  })).body;
}
async function refreshGoogleToken(env, tokens) {
  if (!tokens.refresh_token) throw new Error('YOUTUBE_REAUTH_REQUIRED');
  const fresh = (await providerJson('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, refresh_token: tokens.refresh_token, grant_type: 'refresh_token' })
  })).body;
  return { ...tokens, ...fresh, refresh_token: tokens.refresh_token };
}

async function upsertConnection(env, row, tokens, updatedBy) {
  const now = nowIso();
  const id = row.id || uid('conn');
  const cipher = await encryptTokens(env, tokens);
  await env.DB.prepare(`INSERT INTO social_connections
    (id, tenant_id, provider, provider_account_id, account_name, account_handle, status, token_ciphertext, token_expires_at, scopes, metadata_json, created_at, updated_at, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, 'connected', ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(tenant_id, provider, provider_account_id) DO UPDATE SET
      account_name=excluded.account_name, account_handle=excluded.account_handle, status='connected', token_ciphertext=excluded.token_ciphertext,
      token_expires_at=excluded.token_expires_at, scopes=excluded.scopes, metadata_json=excluded.metadata_json, updated_at=excluded.updated_at, updated_by=excluded.updated_by`)
    .bind(id, row.tenantId, row.provider, row.providerAccountId, row.accountName || '', row.accountHandle || '', cipher,
      row.tokenExpiresAt || null, row.scopes || '', JSON.stringify(row.metadata || {}), now, now, updatedBy || '').run();
}

async function oauthStart(request, env, provider, session) {
  const body = await readJson(request) || {};
  const tenantId = text(body.tenantId, 80);
  if (!tenantId) return json({ error: 'tenantId_required' }, 400);
  const returnUrl = safeReturnUrl(body.returnUrl, env);
  const state = crypto.randomUUID() + crypto.randomUUID();
  const stateHash = await sha256(state);
  const created = new Date();
  const expires = new Date(created.getTime() + 10 * 60 * 1000);
  await env.DB.prepare('INSERT INTO social_oauth_states (state_hash, provider, tenant_id, return_url, requested_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(stateHash, provider, tenantId, returnUrl, text(session.email, 160), created.toISOString(), expires.toISOString()).run();
  const origin = new URL(request.url).origin;
  const redirectUri = `${origin}/api/social/oauth/${provider}/callback`;
  let authorizationUrl;
  if (provider === 'meta') {
    if (!env.META_APP_ID) return json({ error: 'META_APP_ID_not_configured' }, 503);
    const auth = new URL(`https://www.facebook.com/${metaVersion(env)}/dialog/oauth`);
    auth.search = new URLSearchParams({ client_id: env.META_APP_ID, redirect_uri: redirectUri, state, response_type: 'code', scope: text(env.META_SCOPES || META_DEFAULT_SCOPES, 500) }).toString();
    authorizationUrl = auth.toString();
  } else if (provider === 'youtube') {
    if (!env.GOOGLE_CLIENT_ID) return json({ error: 'GOOGLE_CLIENT_ID_not_configured' }, 503);
    const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    auth.search = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, redirect_uri: redirectUri, state, response_type: 'code', scope: YOUTUBE_SCOPES, access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true' }).toString();
    authorizationUrl = auth.toString();
  } else return json({ error: 'unsupported_oauth_provider' }, 400);
  return json({ provider, authorizationUrl, expiresAt: expires.toISOString() });
}

async function oauthCallback(request, env, provider) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code') || '';
  const state = url.searchParams.get('state') || '';
  if (!code || !state) return json({ error: url.searchParams.get('error') || 'oauth_callback_invalid' }, 400);
  const stateHash = await sha256(state);
  const row = await env.DB.prepare('SELECT * FROM social_oauth_states WHERE state_hash = ? AND provider = ?').bind(stateHash, provider).first();
  if (!row || Date.parse(row.expires_at) < Date.now()) return json({ error: 'oauth_state_invalid_or_expired' }, 400);
  await env.DB.prepare('DELETE FROM social_oauth_states WHERE state_hash = ?').bind(stateHash).run();
  const redirectUri = `${url.origin}/api/social/oauth/${provider}/callback`;
  if (provider === 'meta') {
    const token = await exchangeMetaCode(env, code, redirectUri);
    const userToken = token.access_token;
    const accounts = (await providerJson(`${metaBase(env)}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&limit=100&access_token=${encodeURIComponent(userToken)}`)).body.data || [];
    for (const page of accounts) {
      const expiresAt = token.expires_in ? new Date(Date.now() + Number(token.expires_in) * 1000).toISOString() : null;
      await upsertConnection(env, { tenantId: row.tenant_id, provider: 'facebook', providerAccountId: page.id, accountName: page.name, scopes: text(env.META_SCOPES || META_DEFAULT_SCOPES, 500), tokenExpiresAt: expiresAt, metadata: { pageId: page.id } }, { access_token: page.access_token || userToken }, row.requested_by);
      if (page.instagram_business_account?.id) {
        await upsertConnection(env, { tenantId: row.tenant_id, provider: 'instagram', providerAccountId: page.instagram_business_account.id, accountName: page.instagram_business_account.username || page.name, accountHandle: page.instagram_business_account.username || '', scopes: text(env.META_SCOPES || META_DEFAULT_SCOPES, 500), tokenExpiresAt: expiresAt, metadata: { pageId: page.id, instagramUserId: page.instagram_business_account.id } }, { access_token: page.access_token || userToken }, row.requested_by);
      }
    }
  } else if (provider === 'youtube') {
    const token = await exchangeGoogleCode(env, code, redirectUri);
    const channels = (await providerJson('https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true', { headers: { authorization: `Bearer ${token.access_token}` } })).body.items || [];
    for (const channel of channels) {
      await upsertConnection(env, { tenantId: row.tenant_id, provider: 'youtube', providerAccountId: channel.id, accountName: channel.snippet?.title || 'YouTube', accountHandle: channel.snippet?.customUrl || '', scopes: YOUTUBE_SCOPES, tokenExpiresAt: token.expires_in ? new Date(Date.now() + Number(token.expires_in) * 1000).toISOString() : null, metadata: { channelId: channel.id } }, token, row.requested_by);
    }
  }
  return Response.redirect(row.return_url || 'https://admin.ekodi.kr/#social', 303);
}

async function loadConnection(env, connectionId) {
  const row = await env.DB.prepare('SELECT * FROM social_connections WHERE id = ?').bind(connectionId).first();
  if (!row || row.status !== 'connected') throw new Error('CONNECTION_NOT_AVAILABLE');
  let tokens = await decryptTokens(env, row.token_ciphertext);
  if (row.provider === 'youtube' && row.token_expires_at && Date.parse(row.token_expires_at) < Date.now() + 60_000) {
    tokens = await refreshGoogleToken(env, tokens);
    const expiresAt = tokens.expires_in ? new Date(Date.now() + Number(tokens.expires_in) * 1000).toISOString() : null;
    await env.DB.prepare('UPDATE social_connections SET token_ciphertext = ?, token_expires_at = ?, updated_at = ? WHERE id = ?')
      .bind(await encryptTokens(env, tokens), expiresAt, nowIso(), row.id).run();
  }
  return { ...row, tokens, metadata: JSON.parse(row.metadata_json || '{}') };
}

async function publishFacebook(post, connection, env) {
  const token = connection.tokens.access_token;
  const pageId = connection.provider_account_id;
  let endpoint = `${metaBase(env)}/${pageId}/feed`;
  const params = { access_token: token, message: post.message || '' };
  if (post.asset_url && post.asset_type === 'image') { endpoint = `${metaBase(env)}/${pageId}/photos`; params.url = post.asset_url; params.caption = post.message || ''; delete params.message; }
  else if (post.asset_url && post.asset_type === 'video') { endpoint = `${metaBase(env)}/${pageId}/videos`; params.file_url = post.asset_url; params.description = post.message || ''; delete params.message; }
  else if (post.tracked_url) params.link = post.tracked_url;
  const result = (await providerJson(endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params) })).body;
  const id = result.post_id || result.id;
  if (!id) throw new Error('FACEBOOK_PROVIDER_ID_MISSING');
  return { id, url: `https://www.facebook.com/${id}` };
}

async function publishInstagram(post, connection, env) {
  if (!post.asset_url) throw new Error('INSTAGRAM_MEDIA_REQUIRED');
  const token = connection.tokens.access_token;
  const igId = connection.provider_account_id;
  const create = new URLSearchParams({ access_token: token, caption: [post.message, post.tracked_url].filter(Boolean).join('\n\n') });
  if (post.asset_type === 'video') { create.set('video_url', post.asset_url); create.set('media_type', 'REELS'); }
  else create.set('image_url', post.asset_url);
  const container = (await providerJson(`${metaBase(env)}/${igId}/media`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: create })).body;
  if (!container.id) throw new Error('INSTAGRAM_CONTAINER_ID_MISSING');
  if (post.asset_type === 'video') {
    for (let i = 0; i < 8; i++) {
      const state = (await providerJson(`${metaBase(env)}/${container.id}?fields=status_code,status&access_token=${encodeURIComponent(token)}`)).body;
      if (state.status_code === 'FINISHED') break;
      if (state.status_code === 'ERROR' || state.status_code === 'EXPIRED') throw new Error(`INSTAGRAM_CONTAINER_${state.status_code}`);
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }
  const published = (await providerJson(`${metaBase(env)}/${igId}/media_publish`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ access_token: token, creation_id: container.id }) })).body;
  if (!published.id) throw new Error('INSTAGRAM_PROVIDER_ID_MISSING');
  return { id: published.id, url: '' };
}

async function publishYouTube(post, connection) {
  if (!post.asset_url || post.asset_type !== 'video') throw new Error('YOUTUBE_VIDEO_REQUIRED');
  const media = await fetch(post.asset_url);
  if (!media.ok || !media.body) throw new Error(`YOUTUBE_MEDIA_FETCH_${media.status}`);
  const contentType = media.headers.get('content-type') || 'video/mp4';
  const metadata = JSON.parse(post.metadata_json || '{}');
  const uploadUrl = new URL('https://www.googleapis.com/upload/youtube/v3/videos');
  uploadUrl.search = new URLSearchParams({ uploadType: 'resumable', part: 'snippet,status', notifySubscribers: metadata.notifySubscribers === false ? 'false' : 'true' }).toString();
  const init = await fetch(uploadUrl, {
    method: 'POST',
    headers: { authorization: `Bearer ${connection.tokens.access_token}`, 'content-type': 'application/json; charset=utf-8', 'x-upload-content-type': contentType },
    body: JSON.stringify({ snippet: { title: post.title || text(post.message, 100) || 'EKODI', description: [post.message, post.tracked_url].filter(Boolean).join('\n\n'), tags: Array.isArray(metadata.tags) ? metadata.tags.slice(0, 30) : undefined }, status: { privacyStatus: metadata.privacyStatus || 'public', selfDeclaredMadeForKids: Boolean(metadata.madeForKids) } })
  });
  if (!init.ok) throw new Error(`YOUTUBE_UPLOAD_INIT_${init.status}`);
  const location = init.headers.get('location');
  if (!location) throw new Error('YOUTUBE_UPLOAD_LOCATION_MISSING');
  const uploaded = await fetch(location, { method: 'PUT', headers: { 'content-type': contentType }, body: media.body });
  const body = await uploaded.json().catch(() => ({}));
  if (!uploaded.ok) { const error = new Error(body?.error?.message || `YOUTUBE_UPLOAD_${uploaded.status}`); error.status = uploaded.status; error.code = body?.error?.errors?.[0]?.reason || `HTTP_${uploaded.status}`; throw error; }
  if (!body.id) throw new Error('YOUTUBE_PROVIDER_ID_MISSING');
  return { id: body.id, url: `https://www.youtube.com/watch?v=${encodeURIComponent(body.id)}` };
}

async function publishPost(env, post) {
  const connection = await loadConnection(env, post.connection_id);
  if (connection.tenant_id !== post.tenant_id || connection.provider !== post.provider) throw new Error('CONNECTION_TENANT_PROVIDER_MISMATCH');
  if (post.provider === 'facebook') return publishFacebook(post, connection, env);
  if (post.provider === 'instagram') return publishInstagram(post, connection, env);
  if (post.provider === 'youtube') return publishYouTube(post, connection);
  throw new Error('UNSUPPORTED_PROVIDER');
}

async function executePost(env, post) {
  const attemptNo = Number(post.attempt_count || 0) + 1;
  const startedAt = nowIso();
  await env.DB.prepare("UPDATE social_posts SET state='publishing', attempt_count=?, updated_at=? WHERE id=? AND state IN ('scheduled','failed')")
    .bind(attemptNo, startedAt, post.id).run();
  try {
    const result = await publishPost(env, post);
    const finished = nowIso();
    await env.DB.batch([
      env.DB.prepare("UPDATE social_posts SET state='published', provider_post_id=?, provider_url=?, published_at=?, updated_at=?, last_error_code='', last_error_message='' WHERE id=?")
        .bind(result.id, result.url || '', finished, finished, post.id),
      env.DB.prepare("INSERT INTO social_publish_attempts (id, post_id, attempt_no, status, provider_object_id, started_at, finished_at) VALUES (?, ?, ?, 'published', ?, ?, ?)")
        .bind(uid('try'), post.id, attemptNo, result.id, startedAt, finished)
    ]);
    return { ok: true, postId: post.id, providerPostId: result.id };
  } catch (error) {
    const finished = nowIso();
    const code = text(error.code || error.message || 'PUBLISH_FAILED', 120);
    const message = text(error.message || 'Publish failed', 500);
    await env.DB.batch([
      env.DB.prepare("UPDATE social_posts SET state='failed', updated_at=?, last_error_code=?, last_error_message=? WHERE id=?").bind(finished, code, message, post.id),
      env.DB.prepare("INSERT INTO social_publish_attempts (id, post_id, attempt_no, status, provider_http_status, error_code, error_message, started_at, finished_at) VALUES (?, ?, ?, 'failed', ?, ?, ?, ?, ?)")
        .bind(uid('try'), post.id, attemptNo, error.status || null, code, message, startedAt, finished)
    ]);
    return { ok: false, postId: post.id, error: code };
  }
}

export async function processScheduledSocialPosts(env, limit = 8) {
  if (!env.DB) return [];
  await ensureSchema(env.DB);
  const due = await env.DB.prepare("SELECT * FROM social_posts WHERE state='scheduled' AND scheduled_at <= ? ORDER BY scheduled_at ASC LIMIT ?")
    .bind(nowIso(), Math.max(1, Math.min(25, Number(limit) || 8))).all();
  const results = [];
  for (const post of due.results || []) results.push(await executePost(env, post));
  return results;
}

async function syncMetricsForPost(env, post) {
  const connection = await loadConnection(env, post.connection_id);
  const metrics = {};
  if (post.provider === 'youtube') {
    const data = (await providerJson(`https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${encodeURIComponent(post.provider_post_id)}`, { headers: { authorization: `Bearer ${connection.tokens.access_token}` } })).body.items?.[0]?.statistics || {};
    for (const [key, value] of Object.entries(data)) if (Number.isFinite(Number(value))) metrics[key] = Number(value);
  } else if (post.provider === 'instagram') {
    const data = (await providerJson(`${metaBase(env)}/${encodeURIComponent(post.provider_post_id)}?fields=like_count,comments_count&access_token=${encodeURIComponent(connection.tokens.access_token)}`)).body;
    metrics.likes = Number(data.like_count || 0); metrics.comments = Number(data.comments_count || 0);
  } else if (post.provider === 'facebook') {
    const data = (await providerJson(`${metaBase(env)}/${encodeURIComponent(post.provider_post_id)}?fields=shares,likes.summary(true),comments.summary(true)&access_token=${encodeURIComponent(connection.tokens.access_token)}`)).body;
    metrics.shares = Number(data.shares?.count || 0); metrics.likes = Number(data.likes?.summary?.total_count || 0); metrics.comments = Number(data.comments?.summary?.total_count || 0);
  }
  const collected = nowIso();
  const insert = env.DB.prepare('INSERT OR IGNORE INTO social_post_metrics (post_id, provider, metric_name, metric_value, collected_at) VALUES (?, ?, ?, ?, ?)');
  if (Object.keys(metrics).length) await env.DB.batch(Object.entries(metrics).map(([name, value]) => insert.bind(post.id, post.provider, name, value, collected)));
  return metrics;
}

async function rebuildLearnings(env, tenantId) {
  const rows = await env.DB.prepare(`SELECT p.provider, p.asset_type, p.id,
      COALESCE((SELECT SUM(metric_value) FROM social_post_metrics m WHERE m.post_id=p.id AND m.metric_name IN ('likes','comments','shares','viewCount')),0) engagement,
      COALESCE((SELECT COUNT(*) FROM social_events e WHERE e.post_id=p.id AND e.event_type='click'),0) clicks,
      COALESCE((SELECT COUNT(*) FROM social_events e WHERE e.post_id=p.id AND e.event_type IN ('lead','purchase')),0) conversions
    FROM social_posts p WHERE p.tenant_id=? AND p.state='published' ORDER BY p.published_at DESC LIMIT 200`).bind(tenantId).all();
  const groups = new Map();
  for (const row of rows.results || []) {
    const key = `${row.provider}:${row.asset_type || 'text'}`;
    const g = groups.get(key) || { provider: row.provider, format: row.asset_type || 'text', posts: 0, engagement: 0, clicks: 0, conversions: 0 };
    g.posts += 1; g.engagement += Number(row.engagement || 0); g.clicks += Number(row.clicks || 0); g.conversions += Number(row.conversions || 0); groups.set(key, g);
  }
  for (const [key, g] of groups) {
    const score = g.posts ? (g.engagement + g.clicks * 3 + g.conversions * 12) / g.posts : 0;
    const summary = `${g.provider} ${g.format} 형식: 게시 ${g.posts}건, 참여 ${g.engagement}, 클릭 ${g.clicks}, 전환 ${g.conversions}, 게시당 가중성과 ${score.toFixed(2)}`;
    const now = nowIso();
    await env.DB.prepare(`INSERT INTO social_learnings (id, tenant_id, provider, pattern_key, summary, evidence_json, confidence, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(tenant_id, provider, pattern_key) DO UPDATE SET summary=excluded.summary, evidence_json=excluded.evidence_json, confidence=excluded.confidence, updated_at=excluded.updated_at`)
      .bind(uid('learn'), tenantId, g.provider, key, summary, JSON.stringify(g), Math.min(0.95, 0.35 + g.posts * 0.08), now, now).run();
  }
}

function publicConnection(row) {
  return { id: row.id, tenantId: row.tenant_id, provider: row.provider, providerAccountId: row.provider_account_id, accountName: row.account_name, accountHandle: row.account_handle, status: row.status, tokenExpiresAt: row.token_expires_at, scopes: row.scopes, metadata: JSON.parse(row.metadata_json || '{}'), updatedAt: row.updated_at };
}
function publicPost(row) {
  return { id: row.id, tenantId: row.tenant_id, campaignId: row.campaign_id, connectionId: row.connection_id, provider: row.provider, state: row.state, message: row.message, title: row.title, assetUrl: row.asset_url, assetType: row.asset_type, destinationUrl: row.destination_url, trackedUrl: row.tracked_url, utmContent: row.utm_content, scheduledAt: row.scheduled_at, publishedAt: row.published_at, providerPostId: row.provider_post_id, providerUrl: row.provider_url, attemptCount: row.attempt_count, lastErrorCode: row.last_error_code, lastErrorMessage: row.last_error_message, metadata: JSON.parse(row.metadata_json || '{}'), createdAt: row.created_at, updatedAt: row.updated_at };
}

export async function handleSocialChannelGateway(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (!path.startsWith('/api/control/social/') && !path.startsWith('/api/social/oauth/') && path !== '/api/social/events') return null;
  await ensureSchema(env.DB);

  const callback = path.match(/^\/api\/social\/oauth\/(meta|youtube)\/callback$/);
  if (callback && request.method === 'GET') {
    try { return await oauthCallback(request, env, callback[1]); }
    catch (error) { console.error('social oauth callback', error); return json({ error: text(error.message || 'oauth_failed', 200) }, 502); }
  }

  if (path === '/api/social/events' && request.method === 'POST') {
    const body = await readJson(request);
    const tenantId = text(body?.tenantId, 80), eventType = text(body?.eventType, 40);
    if (!tenantId || !EVENT_TYPES.has(eventType)) return json({ error: 'invalid_event' }, 400);
    const origin = request.headers.get('origin') || '';
    const allowed = new Set(String(env.SOCIAL_EVENT_ORIGINS || 'https://mall.ekodi.kr,https://ekodi.kr').split(',').map(v => v.trim()).filter(Boolean));
    if (origin && !allowed.has(origin)) return json({ error: 'origin_not_allowed' }, 403);
    await env.DB.prepare('INSERT INTO social_events (id, tenant_id, post_id, campaign_id, event_type, value, currency, anonymous_id, referrer, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(uid('evt'), tenantId, text(body.postId, 80) || null, text(body.campaignId, 80) || null, eventType, Number(body.value || 0) || 0, text(body.currency, 8), text(body.anonymousId, 120), text(request.headers.get('referer'), 500), nowIso()).run();
    return json({ ok: true }, 202, { 'access-control-allow-origin': origin || '*' });
  }

  const auth = await adminSession(request, env);
  if (!auth.session) return auth.response;
  const tenantId = text(url.searchParams.get('tenantId'), 80);

  const start = path.match(/^\/api\/control\/social\/oauth\/(meta|youtube)\/start$/);
  if (start && request.method === 'POST') return oauthStart(request, env, start[1], auth.session);

  if (path === '/api/control/social/connections' && request.method === 'GET') {
    if (!tenantId) return json({ error: 'tenantId_required' }, 400);
    const rows = await env.DB.prepare('SELECT * FROM social_connections WHERE tenant_id=? ORDER BY provider, account_name').bind(tenantId).all();
    return json({ connections: (rows.results || []).map(publicConnection) });
  }
  const disconnect = path.match(/^\/api\/control\/social\/connections\/([^/]+)$/);
  if (disconnect && request.method === 'DELETE') {
    await env.DB.prepare("UPDATE social_connections SET status='disconnected', token_ciphertext='', updated_at=?, updated_by=? WHERE id=?").bind(nowIso(), text(auth.session.email, 160), disconnect[1]).run();
    return json({ ok: true });
  }

  if (path === '/api/control/social/campaigns' && request.method === 'POST') {
    const body = await readJson(request) || {};
    const id = uid('camp'), t = text(body.tenantId, 80), name = text(body.name, 120);
    if (!t || !name) return json({ error: 'tenantId_and_name_required' }, 400);
    const destination = validHttpsUrl(body.destinationUrl, 'destinationUrl');
    const campaign = text(body.utmCampaign || body.name, 120).replace(/\s+/g, '_').toLowerCase();
    const now = nowIso();
    await env.DB.prepare('INSERT INTO social_campaigns (id, tenant_id, name, destination_url, utm_campaign, created_at, updated_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, t, name, destination, campaign, now, now, text(auth.session.email, 160)).run();
    return json({ id, tenantId: t, name, destinationUrl: destination, utmCampaign: campaign }, 201);
  }

  if (path === '/api/control/social/posts' && request.method === 'POST') {
    const body = await readJson(request) || {};
    const t = text(body.tenantId, 80), connectionId = text(body.connectionId, 80);
    if (!t || !connectionId) return json({ error: 'tenantId_and_connectionId_required' }, 400);
    const connection = await env.DB.prepare('SELECT tenant_id, provider, status FROM social_connections WHERE id=?').bind(connectionId).first();
    if (!connection || connection.tenant_id !== t || connection.status !== 'connected') return json({ error: 'connection_not_available' }, 409);
    const provider = connection.provider;
    const assetUrl = body.assetUrl ? validHttpsUrl(body.assetUrl, 'assetUrl', true) : '';
    const assetType = text(body.assetType, 20).toLowerCase();
    if (provider === 'instagram' && !assetUrl) return json({ error: 'instagram_media_required' }, 400);
    if (provider === 'youtube' && (!assetUrl || assetType !== 'video')) return json({ error: 'youtube_video_required' }, 400);
    let campaign = null;
    if (body.campaignId) campaign = await env.DB.prepare('SELECT * FROM social_campaigns WHERE id=? AND tenant_id=?').bind(text(body.campaignId, 80), t).first();
    const destination = body.destinationUrl ? validHttpsUrl(body.destinationUrl, 'destinationUrl', true) : (campaign?.destination_url || '');
    const id = uid('post');
    const utmContent = text(body.utmContent || id, 120);
    const trackedUrl = destination ? appendUtm(destination, provider, campaign?.utm_campaign || text(body.utmCampaign, 120), utmContent) : '';
    const schedule = body.scheduledAt ? new Date(body.scheduledAt) : null;
    if (schedule && Number.isNaN(schedule.getTime())) return json({ error: 'scheduledAt_invalid' }, 400);
    const state = schedule ? 'scheduled' : 'draft';
    const now = nowIso();
    await env.DB.prepare(`INSERT INTO social_posts
      (id, tenant_id, campaign_id, connection_id, provider, state, message, title, asset_url, asset_type, destination_url, tracked_url, utm_content, scheduled_at, metadata_json, created_at, updated_at, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, t, campaign?.id || null, connectionId, provider, state, text(body.message, 5000), text(body.title, 160), assetUrl, assetType, destination, trackedUrl, utmContent, schedule?.toISOString() || null, JSON.stringify(body.metadata || {}), now, now, text(auth.session.email, 160)).run();
    const row = await env.DB.prepare('SELECT * FROM social_posts WHERE id=?').bind(id).first();
    return json({ post: publicPost(row) }, 201);
  }

  if (path === '/api/control/social/posts' && request.method === 'GET') {
    if (!tenantId) return json({ error: 'tenantId_required' }, 400);
    const rows = await env.DB.prepare('SELECT * FROM social_posts WHERE tenant_id=? ORDER BY created_at DESC LIMIT 200').bind(tenantId).all();
    return json({ posts: (rows.results || []).map(publicPost) });
  }

  const action = path.match(/^\/api\/control\/social\/posts\/([^/]+)\/(publish|schedule|retry|cancel)$/);
  if (action && request.method === 'POST') {
    const post = await env.DB.prepare('SELECT * FROM social_posts WHERE id=?').bind(action[1]).first();
    if (!post) return json({ error: 'post_not_found' }, 404);
    if (action[2] === 'cancel') {
      if (!['draft', 'scheduled', 'failed'].includes(post.state)) return json({ error: 'post_not_cancellable' }, 409);
      await env.DB.prepare("UPDATE social_posts SET state='cancelled', updated_at=? WHERE id=?").bind(nowIso(), post.id).run();
      return json({ ok: true, state: 'cancelled' });
    }
    if (action[2] === 'schedule') {
      const body = await readJson(request) || {};
      const date = new Date(body.scheduledAt);
      if (Number.isNaN(date.getTime())) return json({ error: 'scheduledAt_invalid' }, 400);
      if (!['draft', 'failed', 'scheduled'].includes(post.state)) return json({ error: 'post_not_schedulable' }, 409);
      await env.DB.prepare("UPDATE social_posts SET state='scheduled', scheduled_at=?, updated_at=?, last_error_code='', last_error_message='' WHERE id=?").bind(date.toISOString(), nowIso(), post.id).run();
      return json({ ok: true, state: 'scheduled', scheduledAt: date.toISOString() });
    }
    if (!['draft', 'failed', 'scheduled'].includes(post.state)) return json({ error: 'post_not_publishable' }, 409);
    await env.DB.prepare("UPDATE social_posts SET state='scheduled', scheduled_at=? WHERE id=?").bind(nowIso(), post.id).run();
    const fresh = await env.DB.prepare('SELECT * FROM social_posts WHERE id=?').bind(post.id).first();
    return json(await executePost(env, fresh), 200);
  }

  if (path === '/api/control/social/metrics/sync' && request.method === 'POST') {
    const body = await readJson(request) || {};
    const t = text(body.tenantId, 80);
    if (!t) return json({ error: 'tenantId_required' }, 400);
    const rows = await env.DB.prepare("SELECT * FROM social_posts WHERE tenant_id=? AND state='published' AND provider_post_id<>'' ORDER BY published_at DESC LIMIT 60").bind(t).all();
    const synced = [];
    for (const post of rows.results || []) {
      try { synced.push({ postId: post.id, metrics: await syncMetricsForPost(env, post) }); }
      catch (error) { synced.push({ postId: post.id, error: text(error.code || error.message, 160) }); }
    }
    await rebuildLearnings(env, t);
    return json({ synced });
  }

  if (path === '/api/control/social/performance' && request.method === 'GET') {
    if (!tenantId) return json({ error: 'tenantId_required' }, 400);
    const posts = await env.DB.prepare(`SELECT p.id,p.provider,p.state,p.published_at,p.tracked_url,
      COALESCE((SELECT MAX(metric_value) FROM social_post_metrics m WHERE m.post_id=p.id AND m.metric_name IN ('viewCount','views')),0) views,
      COALESCE((SELECT COUNT(*) FROM social_events e WHERE e.post_id=p.id AND e.event_type='click'),0) clicks,
      COALESCE((SELECT COUNT(*) FROM social_events e WHERE e.post_id=p.id AND e.event_type IN ('lead','purchase')),0) conversions
      FROM social_posts p WHERE p.tenant_id=? ORDER BY p.created_at DESC LIMIT 200`).bind(tenantId).all();
    const learnings = await env.DB.prepare('SELECT provider,pattern_key,summary,evidence_json,confidence,updated_at FROM social_learnings WHERE tenant_id=? ORDER BY confidence DESC, updated_at DESC').bind(tenantId).all();
    return json({ posts: posts.results || [], learnings: learnings.results || [] });
  }

  return json({ error: 'social_gateway_endpoint_not_found' }, 404);
}

export { appendUtm, ensureSchema as ensureSocialPublishingSchema, POST_STATES };
