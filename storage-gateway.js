const STORAGE_PREFIX = '/api/storage/v1';
const MAX_INLINE_BYTES = 8 * 1024 * 1024;

const KNOWN_ROOTS = Object.freeze({
  core: '1q-6OpN9zN2mD6EBaX-KJ5MoBEYdIZcwo',
  backup: '19sHUDWjPL-a66prnpCJN4H24hUqEJpiL',
});

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...extra,
    },
  });
}

function constantTimeEqual(a, b) {
  const aa = new TextEncoder().encode(String(a || ''));
  const bb = new TextEncoder().encode(String(b || ''));
  if (aa.length !== bb.length || aa.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < aa.length; i += 1) diff |= aa[i] ^ bb[i];
  return diff === 0;
}

function authorized(request, env) {
  const expected = String(env.EKODI_STORAGE_GATEWAY_KEY || '').trim();
  const supplied = String(request.headers.get('x-ekodi-storage-key') || '').trim();
  return expected && constantTimeEqual(expected, supplied);
}

function safeName(value) {
  const cleaned = String(value || 'record').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim();
  return (cleaned || 'record').slice(0, 180);
}

function allowedFolderIds(env) {
  const ids = new Set(Object.values(KNOWN_ROOTS));
  for (const id of String(env.EKODI_DRIVE_ALLOWED_FOLDER_IDS || '').split(',')) {
    if (id.trim()) ids.add(id.trim());
  }
  const defaultId = String(env.EKODI_DRIVE_RECORDS_FOLDER_ID || '').trim();
  if (defaultId) ids.add(defaultId);
  return ids;
}

function resolveFolderId(body, env) {
  const requested = String(body.parentFolderId || '').trim();
  if (requested) {
    if (!allowedFolderIds(env).has(requested)) throw new Error('STORAGE_FOLDER_NOT_ALLOWED');
    return requested;
  }
  const root = String(body.root || '').trim().toLowerCase();
  if (root && KNOWN_ROOTS[root]) return KNOWN_ROOTS[root];
  const fallback = String(env.EKODI_DRIVE_RECORDS_FOLDER_ID || '').trim();
  if (!fallback) throw new Error('STORAGE_DEFAULT_FOLDER_MISSING');
  return fallback;
}

function decodeBody(body) {
  if (typeof body.contentText === 'string') {
    const bytes = new TextEncoder().encode(body.contentText);
    if (bytes.byteLength > MAX_INLINE_BYTES) throw new Error('STORAGE_PAYLOAD_TOO_LARGE');
    return bytes;
  }
  if (typeof body.contentBase64 === 'string') {
    const binary = atob(body.contentBase64);
    if (binary.length > MAX_INLINE_BYTES) throw new Error('STORAGE_PAYLOAD_TOO_LARGE');
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  throw new Error('STORAGE_CONTENT_REQUIRED');
}

function validateRecord(body) {
  if (!body || typeof body !== 'object') throw new Error('STORAGE_INVALID_BODY');
  const required = ['spaceId', 'serviceId', 'recordType', 'createdBy', 'retentionClass'];
  for (const key of required) {
    if (!String(body[key] || '').trim()) throw new Error(`STORAGE_MISSING_${key.toUpperCase()}`);
  }
  const retention = new Set(['temporary', 'operational', 'business_record', 'permanent']);
  if (!retention.has(String(body.retentionClass))) throw new Error('STORAGE_INVALID_RETENTION');
}

function pemToArrayBuffer(pem) {
  const normalized = String(pem || '').replace(/\\n/g, '\n');
  const base64 = normalized.replace(/-----BEGIN PRIVATE KEY-----/g, '').replace(/-----END PRIVATE KEY-----/g, '').replace(/\s+/g, '');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function base64Url(bytes) {
  let binary = '';
  const array = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < array.length; i += 1) binary += String.fromCharCode(array[i]);
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function serviceAccountAccessToken(env) {
  const direct = String(env.GOOGLE_DRIVE_ACCESS_TOKEN || '').trim();
  if (direct) return direct;

  const email = String(env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '').trim();
  const privateKey = String(env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '').trim();
  if (!email || !privateKey) throw new Error('GOOGLE_DRIVE_CREDENTIALS_MISSING');

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(new TextEncoder().encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claim = base64Url(new TextEncoder().encode(JSON.stringify({
    iss: email,
    scope: 'https://www.googleapis.com/auth/drive',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3500,
  })));
  const unsigned = `${header}.${claim}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(privateKey),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const assertion = `${unsigned}.${base64Url(signature)}`;
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!tokenResponse.ok) throw new Error(`GOOGLE_TOKEN_ERROR_${tokenResponse.status}`);
  const token = await tokenResponse.json();
  if (!token.access_token) throw new Error('GOOGLE_TOKEN_MISSING');
  return token.access_token;
}

async function uploadToDrive(env, body, bytes, folderId) {
  const token = await serviceAccountAccessToken(env);
  const mimeType = String(body.mimeType || 'application/octet-stream').slice(0, 120);
  const metadata = {
    name: safeName(body.title || `${body.recordType}-${Date.now()}`),
    parents: [folderId],
    appProperties: {
      ekodiSpaceId: String(body.spaceId).slice(0, 120),
      ekodiServiceId: String(body.serviceId).slice(0, 120),
      ekodiRecordType: String(body.recordType).slice(0, 120),
      ekodiCreatedBy: String(body.createdBy).slice(0, 120),
      ekodiRetention: String(body.retentionClass).slice(0, 40),
      ekodiSourceModule: String(body.sourceModuleId || 'ekodi').slice(0, 120),
    },
  };
  const boundary = `ekodi_${crypto.randomUUID().replace(/-/g, '')}`;
  const encoder = new TextEncoder();
  const prefix = encoder.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`);
  const suffix = encoder.encode(`\r\n--${boundary}--`);
  const payload = new Uint8Array(prefix.length + bytes.length + suffix.length);
  payload.set(prefix, 0);
  payload.set(bytes, prefix.length);
  payload.set(suffix, prefix.length + bytes.length);

  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,mimeType,webViewLink,parents,createdTime', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': `multipart/related; boundary=${boundary}`,
    },
    body: payload,
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`GOOGLE_DRIVE_UPLOAD_${response.status}:${detail}`);
  }
  return response.json();
}

async function audit(env, request, body, result, status) {
  if (!env.DB) return;
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS storage_audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id TEXT NOT NULL,
    space_id TEXT NOT NULL,
    service_id TEXT NOT NULL,
    record_type TEXT NOT NULL,
    retention_class TEXT NOT NULL,
    source_module_id TEXT NOT NULL DEFAULT '',
    drive_file_id TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`).run();
  await env.DB.prepare(`INSERT INTO storage_audit_logs
    (request_id, space_id, service_id, record_type, retention_class, source_module_id, drive_file_id, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      request.headers.get('x-request-id') || crypto.randomUUID(),
      String(body.spaceId || ''), String(body.serviceId || ''), String(body.recordType || ''),
      String(body.retentionClass || ''), String(body.sourceModuleId || ''), String(result?.id || ''),
      status, new Date().toISOString(),
    ).run();
}

function errorStatus(message) {
  if (message.includes('NOT_ALLOWED')) return 403;
  if (message.includes('PAYLOAD_TOO_LARGE')) return 413;
  if (message.includes('MISSING') || message.includes('REQUIRED') || message.includes('INVALID')) return 400;
  if (message.includes('CREDENTIALS')) return 503;
  return 502;
}

export async function handleStorageGateway(request, env = {}) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(STORAGE_PREFIX)) return null;

  if (request.method === 'GET' && url.pathname === `${STORAGE_PREFIX}/health`) {
    return json({
      ok: true,
      version: '1.0.0',
      canonicalStore: 'google_workspace_shared_drive',
      driveName: 'EKODI',
      credentialsConfigured: Boolean(env.GOOGLE_DRIVE_ACCESS_TOKEN || (env.GOOGLE_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY)),
      defaultFolderConfigured: Boolean(env.EKODI_DRIVE_RECORDS_FOLDER_ID),
      directExternalDriveAccess: false,
    });
  }

  if (!authorized(request, env)) return json({ error: 'Storage Gateway 인증이 필요합니다.', code: 'STORAGE_UNAUTHORIZED' }, 401);

  if (request.method === 'GET' && url.pathname === `${STORAGE_PREFIX}/policy`) {
    return json({
      version: '1.0.0',
      canonicalStore: 'google_workspace_shared_drive',
      driveName: 'EKODI',
      operationalStore: 'd1_or_supabase',
      deliveryStore: 'cloudflare_r2',
      directExternalDriveAccess: false,
      knownRoots: Object.keys(KNOWN_ROOTS),
    });
  }

  if (request.method === 'POST' && url.pathname === `${STORAGE_PREFIX}/records`) {
    let body;
    try { body = await request.json(); }
    catch { return json({ error: 'JSON 요청이 필요합니다.', code: 'STORAGE_INVALID_JSON' }, 400); }
    try {
      validateRecord(body);
      const folderId = resolveFolderId(body, env);
      const bytes = decodeBody(body);
      const result = await uploadToDrive(env, body, bytes, folderId);
      await audit(env, request, body, result, 'stored');
      return json({
        ok: true,
        systemOfRecord: 'google_workspace_shared_drive',
        driveName: 'EKODI',
        file: result,
        metadata: {
          spaceId: body.spaceId,
          serviceId: body.serviceId,
          recordType: body.recordType,
          retentionClass: body.retentionClass,
          sourceModuleId: body.sourceModuleId || null,
        },
      }, 201);
    } catch (error) {
      console.error('Storage Gateway error', error);
      await audit(env, request, body || {}, null, 'failed').catch(() => {});
      const message = String(error?.message || 'STORAGE_ERROR');
      return json({ error: '공유드라이브 저장 처리에 실패했습니다.', code: message.split(':')[0] }, errorStatus(message));
    }
  }

  return json({ error: 'Storage Gateway endpoint not found', code: 'STORAGE_NOT_FOUND' }, 404);
}

export const STORAGE_GATEWAY_CONTRACT = Object.freeze({
  version: '1.0.0',
  prefix: STORAGE_PREFIX,
  canonicalStore: 'google_workspace_shared_drive',
  driveName: 'EKODI',
  maxInlineBytes: MAX_INLINE_BYTES,
  directExternalDriveAccess: false,
});
