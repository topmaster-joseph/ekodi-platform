import authWorker from './auth-worker.js';

const KAKAO_AUTHORIZE_URL = 'https://kauth.kakao.com/oauth/authorize';
const KAKAO_TOKEN_URL = 'https://kauth.kakao.com/oauth/token';
const KAKAO_API = 'https://kapi.kakao.com';
const REQUIRED_SCOPES = Object.freeze(['friends', 'talk_message']);
const DEFAULT_RETURN_URL = 'https://admin.ekodi.kr/#social';
const MAX_RECIPIENTS_PER_APPROVAL = 25;
const MAX_DAILY_SENDS = 100;
const TOKEN_REFRESH_SKEW_MS = 90_000;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function text(value, max = 200) {
  return String(value || '').trim().slice(0, max);
}

function allowedOrigin(request, env = {}) {
  const origin = String(request.headers.get('origin') || '').trim();
  if (!origin) return '';
  const allowed = new Set(String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean));
  return allowed.has(origin) ? origin : '';
}

function corsHeaders(request, env = {}) {
  const headers = new Headers({
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
    'access-control-max-age': '86400',
    'cache-control': 'no-store',
    'vary': 'Origin',
    'x-content-type-options': 'nosniff',
  });
  const origin = allowedOrigin(request, env);
  if (origin) headers.set('access-control-allow-origin', origin);
  return headers;
}

function json(data, status, request, env) {
  const headers = corsHeaders(request, env);
  headers.set('content-type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(data), { status, headers });
}

async function adminSession(request, env) {
  const url = new URL(request.url);
  url.pathname = '/api/session';
  url.search = '';
  const response = await authWorker.fetch(new Request(url.toString(), {
    method: 'GET',
    headers: request.headers,
  }), env);
  if (!response.ok) return { response };
  return { response, session: await response.clone().json() };
}

async function ensureSchema(db) {
  if (!db) return;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS kakao_personal_connections (
      admin_email TEXT PRIMARY KEY,
      kakao_user_id TEXT NOT NULL DEFAULT '',
      access_token_enc TEXT NOT NULL,
      refresh_token_enc TEXT NOT NULL,
      access_expires_at TEXT NOT NULL,
      refresh_expires_at TEXT,
      scopes TEXT NOT NULL DEFAULT '',
      connected_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS kakao_personal_oauth_states (
      state_hash TEXT PRIMARY KEY,
      admin_email TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS kakao_personal_send_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id TEXT NOT NULL UNIQUE,
      admin_email TEXT NOT NULL,
      recipient_count INTEGER NOT NULL,
      success_count INTEGER NOT NULL DEFAULT 0,
      failure_count INTEGER NOT NULL DEFAULT 0,
      link_host TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      sent_at TEXT
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_kakao_personal_history_admin_time ON kakao_personal_send_history(admin_email, created_at DESC)'),
  ]);
}

function configuration(env = {}) {
  const values = {
    KAKAO_REST_API_KEY: text(env.KAKAO_REST_API_KEY, 256),
    KAKAO_CLIENT_SECRET: text(env.KAKAO_CLIENT_SECRET, 256),
    KAKAO_REDIRECT_URI: text(env.KAKAO_REDIRECT_URI, 500),
    KAKAO_TOKEN_ENCRYPTION_KEY: String(env.KAKAO_TOKEN_ENCRYPTION_KEY || ''),
  };
  const missing = Object.entries(values)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  return {
    ...values,
    configured: missing.length === 0,
    missing,
    returnUrl: text(env.KAKAO_ADMIN_RETURN_URL, 500) || DEFAULT_RETURN_URL,
  };
}

function bytesToBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

async function sha256Hex(value) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(String(value))));
  return [...digest].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function tokenKey(secret) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(secret));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function encryptToken(value, secret) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await tokenKey(secret);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(String(value || '')),
  ));
  return `v1.${bytesToBase64Url(iv)}.${bytesToBase64Url(ciphertext)}`;
}

async function decryptToken(value, secret) {
  const [version, ivText, cipherText] = String(value || '').split('.');
  if (version !== 'v1' || !ivText || !cipherText) throw new Error('Unsupported Kakao token envelope.');
  const key = await tokenKey(secret);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64UrlToBytes(ivText) },
    key,
    base64UrlToBytes(cipherText),
  );
  return decoder.decode(plaintext);
}

function randomState() {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

function expiryFromNow(seconds, fallbackSeconds) {
  const safeSeconds = Number.isFinite(Number(seconds)) ? Number(seconds) : fallbackSeconds;
  return new Date(Date.now() + Math.max(60, safeSeconds) * 1000).toISOString();
}

async function writeAudit(env, email, action, detail = '') {
  if (!env.DB) return;
  try {
    const admin = await env.DB.prepare('SELECT id FROM admins WHERE email = ?').bind(email).first();
    await env.DB.prepare(`INSERT INTO audit_logs
      (admin_id, action, resource, detail, created_at)
      VALUES (?, ?, 'kakao-personal-agent', ?, ?)`) 
      .bind(admin?.id || null, action, text(detail, 500), new Date().toISOString()).run();
  } catch (error) {
    console.warn('Kakao personal audit skipped', error?.message || error);
  }
}

async function tokenRequest(params, config) {
  const body = new URLSearchParams(params);
  body.set('client_id', config.KAKAO_REST_API_KEY);
  body.set('client_secret', config.KAKAO_CLIENT_SECRET);
  const response = await fetch(KAKAO_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded;charset=utf-8' },
    body,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    const error = new Error(payload.error_description || payload.error || `Kakao token request failed (${response.status})`);
    error.code = 'KAKAO_TOKEN_ERROR';
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function kakaoAccessInfo(accessToken) {
  const response = await fetch(`${KAKAO_API}/v1/user/access_token_info`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const payload = await response.json().catch(() => ({}));
  return response.ok ? payload : {};
}

async function connectStart(request, env, session) {
  const config = configuration(env);
  if (!config.configured) {
    return json({
      error: '카카오 앱 연결용 서버 Secret 설정이 아직 완료되지 않았습니다.',
      code: 'KAKAO_NOT_CONFIGURED',
      missing: config.missing,
    }, 503, request, env);
  }
  await ensureSchema(env.DB);
  const state = randomState();
  const stateHash = await sha256Hex(state);
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM kakao_personal_oauth_states WHERE expires_at < ?').bind(now),
    env.DB.prepare(`INSERT INTO kakao_personal_oauth_states
      (state_hash, admin_email, expires_at, created_at)
      VALUES (?, ?, ?, ?)`) 
      .bind(stateHash, session.email, expiresAt, now),
  ]);
  const authorize = new URL(KAKAO_AUTHORIZE_URL);
  authorize.searchParams.set('client_id', config.KAKAO_REST_API_KEY);
  authorize.searchParams.set('redirect_uri', config.KAKAO_REDIRECT_URI);
  authorize.searchParams.set('response_type', 'code');
  authorize.searchParams.set('scope', REQUIRED_SCOPES.join(','));
  authorize.searchParams.set('state', state);
  await writeAudit(env, session.email, 'kakao.personal.connect.start', 'OAuth authorization started');
  return json({ authorizeUrl: authorize.toString(), expiresAt }, 200, request, env);
}

function callbackRedirect(config, result) {
  const target = new URL(config.returnUrl);
  target.searchParams.set('kakao', result);
  return Response.redirect(target.toString(), 302);
}

async function oauthCallback(request, env) {
  const config = configuration(env);
  if (!config.configured || !env.DB) return callbackRedirect(config, 'config-missing');
  await ensureSchema(env.DB);
  const url = new URL(request.url);
  const state = text(url.searchParams.get('state'), 512);
  const code = text(url.searchParams.get('code'), 2048);
  const oauthError = text(url.searchParams.get('error'), 120);
  if (!state) return callbackRedirect(config, oauthError ? 'cancelled' : 'state-missing');

  const stateHash = await sha256Hex(state);
  const row = await env.DB.prepare(`SELECT state_hash, admin_email, expires_at
    FROM kakao_personal_oauth_states WHERE state_hash = ?`).bind(stateHash).first();
  await env.DB.prepare('DELETE FROM kakao_personal_oauth_states WHERE state_hash = ?').bind(stateHash).run();
  if (!row || Date.parse(row.expires_at) <= Date.now()) return callbackRedirect(config, 'state-expired');
  if (oauthError || !code) return callbackRedirect(config, oauthError ? 'cancelled' : 'code-missing');

  try {
    const token = await tokenRequest({
      grant_type: 'authorization_code',
      redirect_uri: config.KAKAO_REDIRECT_URI,
      code,
    }, config);
    const info = await kakaoAccessInfo(token.access_token);
    const now = new Date().toISOString();
    const connectedAt = now;
    const accessTokenEnc = await encryptToken(token.access_token, config.KAKAO_TOKEN_ENCRYPTION_KEY);
    const refreshTokenEnc = await encryptToken(token.refresh_token, config.KAKAO_TOKEN_ENCRYPTION_KEY);
    const accessExpiresAt = expiryFromNow(token.expires_in, 6 * 60 * 60);
    const refreshExpiresAt = expiryFromNow(token.refresh_token_expires_in, 60 * 24 * 60 * 60);
    const scopes = String(token.scope || '').split(/\s+/).filter(Boolean).join(' ');

    await env.DB.prepare(`INSERT INTO kakao_personal_connections
      (admin_email, kakao_user_id, access_token_enc, refresh_token_enc, access_expires_at,
       refresh_expires_at, scopes, connected_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(admin_email) DO UPDATE SET
        kakao_user_id=excluded.kakao_user_id,
        access_token_enc=excluded.access_token_enc,
        refresh_token_enc=excluded.refresh_token_enc,
        access_expires_at=excluded.access_expires_at,
        refresh_expires_at=excluded.refresh_expires_at,
        scopes=excluded.scopes,
        updated_at=excluded.updated_at`) 
      .bind(
        row.admin_email,
        String(info.id || ''),
        accessTokenEnc,
        refreshTokenEnc,
        accessExpiresAt,
        refreshExpiresAt,
        scopes,
        connectedAt,
        now,
      ).run();
    await writeAudit(env, row.admin_email, 'kakao.personal.connect.complete', JSON.stringify({ kakaoUserId: String(info.id || ''), scopes }));
    return callbackRedirect(config, 'connected');
  } catch (error) {
    console.error('Kakao OAuth callback failed', error?.code || error?.message || error);
    await writeAudit(env, row.admin_email, 'kakao.personal.connect.failed', error?.code || 'KAKAO_OAUTH_ERROR');
    return callbackRedirect(config, 'oauth-error');
  }
}

async function connectionRow(env, email) {
  await ensureSchema(env.DB);
  return env.DB.prepare(`SELECT admin_email, kakao_user_id, access_token_enc, refresh_token_enc,
      access_expires_at, refresh_expires_at, scopes, connected_at, updated_at
    FROM kakao_personal_connections WHERE admin_email = ?`).bind(email).first();
}

async function refreshConnection(env, email, row, force = false) {
  const config = configuration(env);
  if (!config.configured) throw Object.assign(new Error('Kakao server configuration is incomplete.'), { code: 'KAKAO_NOT_CONFIGURED' });
  if (!row) throw Object.assign(new Error('카카오 계정을 먼저 연결해 주세요.'), { code: 'KAKAO_NOT_CONNECTED' });
  if (!force && Date.parse(row.access_expires_at) > Date.now() + TOKEN_REFRESH_SKEW_MS) {
    return { row, accessToken: await decryptToken(row.access_token_enc, config.KAKAO_TOKEN_ENCRYPTION_KEY) };
  }

  const refreshToken = await decryptToken(row.refresh_token_enc, config.KAKAO_TOKEN_ENCRYPTION_KEY);
  const token = await tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken }, config);
  const accessTokenEnc = await encryptToken(token.access_token, config.KAKAO_TOKEN_ENCRYPTION_KEY);
  const nextRefreshToken = token.refresh_token || refreshToken;
  const refreshTokenEnc = await encryptToken(nextRefreshToken, config.KAKAO_TOKEN_ENCRYPTION_KEY);
  const accessExpiresAt = expiryFromNow(token.expires_in, 6 * 60 * 60);
  const refreshExpiresAt = token.refresh_token_expires_in
    ? expiryFromNow(token.refresh_token_expires_in, 60 * 24 * 60 * 60)
    : row.refresh_expires_at;
  const scopes = String(token.scope || row.scopes || '').split(/\s+/).filter(Boolean).join(' ');
  const updatedAt = new Date().toISOString();
  await env.DB.prepare(`UPDATE kakao_personal_connections
    SET access_token_enc = ?, refresh_token_enc = ?, access_expires_at = ?,
        refresh_expires_at = ?, scopes = ?, updated_at = ?
    WHERE admin_email = ?`) 
    .bind(accessTokenEnc, refreshTokenEnc, accessExpiresAt, refreshExpiresAt, scopes, updatedAt, email).run();
  const updated = { ...row, access_token_enc: accessTokenEnc, refresh_token_enc: refreshTokenEnc, access_expires_at: accessExpiresAt, refresh_expires_at: refreshExpiresAt, scopes, updated_at: updatedAt };
  return { row: updated, accessToken: token.access_token };
}

async function kakaoFetchWithRefresh(env, email, buildRequest) {
  let row = await connectionRow(env, email);
  let session = await refreshConnection(env, email, row, false);
  let response = await buildRequest(session.accessToken);
  if (response.status === 401) {
    row = await connectionRow(env, email);
    session = await refreshConnection(env, email, row, true);
    response = await buildRequest(session.accessToken);
  }
  return response;
}

async function status(request, env, session) {
  const config = configuration(env);
  if (!env.DB) return json({ configured: config.configured, missing: config.missing, connected: false, databaseConfigured: false }, 200, request, env);
  await ensureSchema(env.DB);
  const row = await connectionRow(env, session.email);
  const scopes = String(row?.scopes || '').split(/\s+/).filter(Boolean);
  return json({
    configured: config.configured,
    missing: config.missing,
    databaseConfigured: true,
    connected: Boolean(row),
    connectedAt: row?.connected_at || null,
    accessExpiresAt: row?.access_expires_at || null,
    refreshExpiresAt: row?.refresh_expires_at || null,
    scopes,
    requiredScopes: REQUIRED_SCOPES,
    consentReady: REQUIRED_SCOPES.every(scope => scopes.includes(scope)),
    sendPolicy: {
      maxRecipientsPerApproval: MAX_RECIPIENTS_PER_APPROVAL,
      maxRecipientsPerKakaoRequest: 5,
      dailySenderLimit: MAX_DAILY_SENDS,
      requiresHumanApproval: true,
      storesFriendDirectory: false,
    },
  }, 200, request, env);
}

async function friends(request, env, session) {
  const url = new URL(request.url);
  const offset = Math.max(0, Math.trunc(Number(url.searchParams.get('offset')) || 0));
  const limit = Math.max(1, Math.min(100, Math.trunc(Number(url.searchParams.get('limit')) || 100)));
  const kakaoUrl = new URL(`${KAKAO_API}/v1/api/talk/friends`);
  kakaoUrl.searchParams.set('offset', String(offset));
  kakaoUrl.searchParams.set('limit', String(limit));
  kakaoUrl.searchParams.set('order', 'asc');
  kakaoUrl.searchParams.set('friend_order', 'nickname');

  const response = await kakaoFetchWithRefresh(env, session.email, accessToken => fetch(kakaoUrl, {
    headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' },
  }));
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return json({
      error: payload.msg || payload.error_description || '카카오 친구 목록을 불러오지 못했습니다.',
      code: payload.code || 'KAKAO_FRIENDS_ERROR',
    }, response.status >= 400 && response.status < 600 ? response.status : 502, request, env);
  }
  const items = (payload.elements || []).map(friend => ({
    uuid: String(friend.uuid || ''),
    nickname: text(friend.profile_nickname || '이름 없음', 80),
    thumbnail: /^https:\/\//.test(String(friend.profile_thumbnail_image || '')) ? String(friend.profile_thumbnail_image) : '',
    favorite: Boolean(friend.favorite),
  })).filter(friend => friend.uuid);
  return json({
    friends: items,
    totalCount: Number(payload.total_count || items.length),
    favoriteCount: Number(payload.favorite_count || 0),
    offset,
    limit,
    hasMore: Boolean(payload.after_url),
  }, 200, request, env);
}

function normalizeSendBody(body) {
  const uuids = Array.isArray(body?.recipientUuids)
    ? [...new Set(body.recipientUuids.map(value => text(value, 180)).filter(Boolean))]
    : [];
  const message = text(body?.message, 200);
  const requestId = text(body?.requestId, 120);
  const approved = body?.approved === true;
  let linkUrl = '';
  try {
    const parsed = new URL(String(body?.linkUrl || ''));
    if (parsed.protocol === 'https:') linkUrl = parsed.toString();
  } catch {}
  return { uuids, message, requestId, approved, linkUrl };
}

async function sentInLast24Hours(env, email) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const row = await env.DB.prepare(`SELECT COALESCE(SUM(success_count), 0) AS sent
    FROM kakao_personal_send_history
    WHERE admin_email = ? AND created_at >= ?`).bind(email, since).first();
  return Number(row?.sent || 0);
}

async function sendChunk(env, email, uuids, templateObject) {
  const response = await kakaoFetchWithRefresh(env, email, accessToken => {
    const body = new URLSearchParams();
    body.set('receiver_uuids', JSON.stringify(uuids));
    body.set('template_object', JSON.stringify(templateObject));
    return fetch(`${KAKAO_API}/v1/api/talk/friends/message/default/send`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/x-www-form-urlencoded;charset=utf-8',
      },
      body,
    });
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      success: 0,
      failure: uuids.length,
      error: text(payload.msg || payload.error_description || `Kakao HTTP ${response.status}`, 180),
      code: payload.code || response.status,
    };
  }
  const success = Array.isArray(payload.successful_receiver_uuids) ? payload.successful_receiver_uuids.length : 0;
  return {
    success,
    failure: Math.max(0, uuids.length - success),
    error: payload.failure_info?.length ? text(payload.failure_info.map(item => item.msg || item.code).join(', '), 180) : '',
    code: payload.failure_info?.[0]?.code || null,
  };
}

async function send(request, env, session) {
  let body;
  try { body = await request.json(); } catch { return json({ error: '요청 형식이 올바르지 않습니다.' }, 400, request, env); }
  const input = normalizeSendBody(body);
  if (!input.approved) return json({ error: '최종 확인 후 승인해야 발송할 수 있습니다.', code: 'HUMAN_APPROVAL_REQUIRED' }, 409, request, env);
  if (!input.requestId) return json({ error: '중복 발송 방지용 requestId가 필요합니다.', code: 'REQUEST_ID_REQUIRED' }, 400, request, env);
  if (!input.message) return json({ error: '메시지를 입력해 주세요.', code: 'MESSAGE_REQUIRED' }, 400, request, env);
  if (!input.linkUrl) return json({ error: 'HTTPS 링크를 입력해 주세요.', code: 'LINK_REQUIRED' }, 400, request, env);
  if (!input.uuids.length) return json({ error: '받는 친구를 한 명 이상 선택해 주세요.', code: 'RECIPIENT_REQUIRED' }, 400, request, env);
  if (input.uuids.length > MAX_RECIPIENTS_PER_APPROVAL) {
    return json({ error: `한 번의 승인으로 최대 ${MAX_RECIPIENTS_PER_APPROVAL}명까지 보낼 수 있습니다.`, code: 'RECIPIENT_LIMIT' }, 400, request, env);
  }

  await ensureSchema(env.DB);
  const existing = await env.DB.prepare(`SELECT request_id, recipient_count, success_count, failure_count, status, created_at, sent_at
    FROM kakao_personal_send_history WHERE request_id = ? AND admin_email = ?`)
    .bind(input.requestId, session.email).first();
  if (existing) return json({ duplicate: true, result: existing }, 200, request, env);

  const alreadySent = await sentInLast24Hours(env, session.email);
  if (alreadySent + input.uuids.length > MAX_DAILY_SENDS) {
    return json({
      error: `최근 24시간 발송량을 포함해 최대 ${MAX_DAILY_SENDS}명까지만 발송합니다.`,
      code: 'DAILY_SAFETY_LIMIT',
      alreadySent,
      remaining: Math.max(0, MAX_DAILY_SENDS - alreadySent),
    }, 429, request, env);
  }

  const now = new Date().toISOString();
  const linkHost = new URL(input.linkUrl).hostname;
  try {
    await env.DB.prepare(`INSERT INTO kakao_personal_send_history
      (request_id, admin_email, recipient_count, success_count, failure_count, link_host, status, created_at)
      VALUES (?, ?, ?, 0, 0, ?, 'sending', ?)`) 
      .bind(input.requestId, session.email, input.uuids.length, linkHost, now).run();
  } catch (error) {
    const duplicate = await env.DB.prepare(`SELECT request_id, recipient_count, success_count, failure_count, status, created_at, sent_at
      FROM kakao_personal_send_history WHERE request_id = ? AND admin_email = ?`)
      .bind(input.requestId, session.email).first();
    if (duplicate) return json({ duplicate: true, result: duplicate }, 200, request, env);
    throw error;
  }

  const templateObject = {
    object_type: 'text',
    text: input.message,
    link: { web_url: input.linkUrl, mobile_web_url: input.linkUrl },
    button_title: '바로 보기',
  };
  let successCount = 0;
  let failureCount = 0;
  const failures = [];
  for (let index = 0; index < input.uuids.length; index += 5) {
    const chunk = input.uuids.slice(index, index + 5);
    try {
      const result = await sendChunk(env, session.email, chunk, templateObject);
      successCount += result.success;
      failureCount += result.failure;
      if (result.failure) failures.push({ count: result.failure, code: result.code, reason: result.error || '일부 수신자 발송 실패' });
    } catch (error) {
      failureCount += chunk.length;
      failures.push({ count: chunk.length, code: error?.code || 'KAKAO_SEND_ERROR', reason: text(error?.message || '카카오 발송 실패', 180) });
    }
  }

  const sentAt = new Date().toISOString();
  const statusValue = successCount === input.uuids.length ? 'sent' : successCount ? 'partial' : 'failed';
  await env.DB.prepare(`UPDATE kakao_personal_send_history
    SET success_count = ?, failure_count = ?, status = ?, sent_at = ?
    WHERE request_id = ? AND admin_email = ?`)
    .bind(successCount, failureCount, statusValue, sentAt, input.requestId, session.email).run();
  await writeAudit(env, session.email, 'kakao.personal.send', JSON.stringify({
    requestId: input.requestId,
    recipients: input.uuids.length,
    success: successCount,
    failure: failureCount,
    linkHost,
  }));

  return json({
    requestId: input.requestId,
    status: statusValue,
    recipientCount: input.uuids.length,
    successCount,
    failureCount,
    failures,
    sentAt,
  }, successCount ? 200 : 502, request, env);
}

async function history(request, env, session) {
  await ensureSchema(env.DB);
  const rows = await env.DB.prepare(`SELECT request_id, recipient_count, success_count, failure_count,
      link_host, status, created_at, sent_at
    FROM kakao_personal_send_history
    WHERE admin_email = ?
    ORDER BY id DESC LIMIT 30`).bind(session.email).all();
  return json({ history: rows.results || [] }, 200, request, env);
}

async function disconnect(request, env, session) {
  await ensureSchema(env.DB);
  await env.DB.prepare('DELETE FROM kakao_personal_connections WHERE admin_email = ?').bind(session.email).run();
  await writeAudit(env, session.email, 'kakao.personal.disconnect', 'Encrypted OAuth token envelope deleted');
  return json({ ok: true, connected: false }, 200, request, env);
}

function errorJson(error, request, env) {
  const code = error?.code || 'KAKAO_PERSONAL_ERROR';
  const known = new Set(['KAKAO_NOT_CONFIGURED', 'KAKAO_NOT_CONNECTED', 'KAKAO_TOKEN_ERROR']);
  const status = code === 'KAKAO_NOT_CONNECTED' ? 409 : code === 'KAKAO_NOT_CONFIGURED' ? 503 : 502;
  return json({
    error: known.has(code) ? error.message : '카카오 개인메시지 처리 중 오류가 발생했습니다.',
    code,
  }, status, request, env);
}

export async function handleKakaoPersonalControl(request, env) {
  const path = new URL(request.url).pathname;
  if (!path.startsWith('/api/control/social/kakao/')) return null;

  if (request.method === 'OPTIONS') {
    const origin = allowedOrigin(request, env);
    if (request.headers.get('origin') && !origin) return json({ error: '허용되지 않은 Origin입니다.', code: 'ORIGIN_FORBIDDEN' }, 403, request, env);
    return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  }

  if (path === '/api/control/social/kakao/callback' && request.method === 'GET') {
    return oauthCallback(request, env);
  }

  const auth = await adminSession(request, env);
  if (!auth.session) return auth.response;
  if (!env.DB) return json({ error: '운영 데이터베이스가 연결되지 않았습니다.', code: 'DATABASE_UNAVAILABLE' }, 503, request, env);

  try {
    if (path === '/api/control/social/kakao/status' && request.method === 'GET') return status(request, env, auth.session);
    if (path === '/api/control/social/kakao/connect' && request.method === 'POST') return connectStart(request, env, auth.session);
    if (path === '/api/control/social/kakao/friends' && request.method === 'GET') return friends(request, env, auth.session);
    if (path === '/api/control/social/kakao/send' && request.method === 'POST') return send(request, env, auth.session);
    if (path === '/api/control/social/kakao/history' && request.method === 'GET') return history(request, env, auth.session);
    if (path === '/api/control/social/kakao/disconnect' && request.method === 'DELETE') return disconnect(request, env, auth.session);
    return json({ error: 'Kakao Personal Agent endpoint not found.', code: 'NOT_FOUND' }, 404, request, env);
  } catch (error) {
    console.error('Kakao Personal Agent error', error?.code || error?.message || error);
    return errorJson(error, request, env);
  }
}

export {
  MAX_DAILY_SENDS,
  MAX_RECIPIENTS_PER_APPROVAL,
  REQUIRED_SCOPES,
  normalizeSendBody,
};
