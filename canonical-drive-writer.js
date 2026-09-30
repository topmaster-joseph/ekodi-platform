const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const SERVICE_ROUTE_ALIASES = Object.freeze({
  root: 'core',
  api: 'core',
  admin: 'core',
  marketing: 'biz',
  trade: 'biz',
  mall: 'biz',
  pay: 'biz',
  lab: 'work',
  edu: 'education',
  media: 'media',
  church: 'church',
  community: 'community',
  books: 'books',
  camp: 'camp',
  backup: 'backup',
  biz: 'biz',
  work: 'work',
  education: 'education',
  core: 'core',
});

function fromB64url(value) {
  const normal = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normal + '='.repeat((4 - normal.length % 4) % 4));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

async function sha256(value) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(String(value || ''))));
}

async function aesKey(env) {
  const material = String(env.STORAGE_CREDENTIAL_KEY || '');
  if (!material) throw new Error('CANONICAL_STORAGE_CREDENTIAL_KEY_MISSING');
  return crypto.subtle.importKey('raw', await sha256(material), 'AES-GCM', false, ['decrypt']);
}

async function decryptCredential(env, row) {
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64url(row.credential_iv) },
    await aesKey(env),
    fromB64url(row.credential_ciphertext),
  );
  return JSON.parse(decoder.decode(plain));
}

function googleClientId(env) {
  return String(env.GOOGLE_DRIVE_CLIENT_ID || env.GOOGLE_CLIENT_ID || '').trim();
}

async function accessToken(env, row) {
  const credential = await decryptCredential(env, row);
  const refreshToken = String(credential?.refreshToken || '').trim();
  const clientId = googleClientId(env);
  const clientSecret = String(env.GOOGLE_DRIVE_CLIENT_SECRET || '').trim();
  if (!refreshToken || !clientId || !clientSecret) throw new Error('CANONICAL_STORAGE_OAUTH_NOT_READY');
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) throw new Error(`CANONICAL_STORAGE_TOKEN_${response.status}`);
  return body.access_token;
}

function normalizeRouteKey(value) {
  const key = String(value || '').trim().toLowerCase();
  return SERVICE_ROUTE_ALIASES[key] || '';
}

async function primaryConnection(env) {
  if (!env.DB) throw new Error('CANONICAL_STORAGE_DB_MISSING');
  const row = await env.DB.prepare(`SELECT * FROM storage_connections
    WHERE role='primary' AND status='ready'
    ORDER BY updated_at DESC LIMIT 1`).first();
  if (!row) throw new Error('CANONICAL_STORAGE_PRIMARY_NOT_READY');
  const expectedId = String(env.STORAGE_PRIMARY_SHARED_DRIVE_ID || '').trim();
  const expectedName = String(env.STORAGE_PRIMARY_SHARED_DRIVE_NAME || 'EKODI').trim().toLowerCase();
  const idMatches = expectedId && String(row.drive_id || '') === expectedId;
  const nameMatches = !expectedId && String(row.drive_name || '').trim().toLowerCase() === expectedName;
  if (!idMatches && !nameMatches) throw new Error('CANONICAL_STORAGE_DRIVE_MISMATCH');
  return row;
}

async function routeFolder(env, routeKey) {
  const row = await env.DB.prepare(`SELECT service_key,folder_name,folder_id
    FROM storage_routes WHERE service_key=? AND connection_role='primary'`).bind(routeKey).first();
  if (!row || !String(row.folder_id || '').trim()) throw new Error('CANONICAL_STORAGE_ROUTE_NOT_READY');
  return row;
}

function safeName(value) {
  const cleaned = String(value || 'record').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim();
  return (cleaned || 'record').slice(0, 180);
}

function driveQueryValue(value) {
  return String(value || '').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
}
async function driveJson(token, path, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('authorization', `Bearer ${token}`);
  if (init.body && !headers.has('content-type')) headers.set('content-type','application/json');
  const response = await fetch(`https://www.googleapis.com/drive/v3${path}`,{...init,headers});
  const data = await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(`CANONICAL_STORAGE_DRIVE_${response.status}`);
  return data;
}
async function ensureSubfolderPath(token, parentId, path = '') {
  const segments = String(path || '').split('/').map(value=>safeName(value)).filter(Boolean).slice(0,8);
  let parent = parentId;
  for (const segment of segments) {
    const params = new URLSearchParams({
      q:`'${driveQueryValue(parent)}' in parents and name = '${driveQueryValue(segment)}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      spaces:'drive',
      pageSize:'1',
      supportsAllDrives:'true',
      includeItemsFromAllDrives:'true',
      fields:'files(id,name)',
    });
    const found = await driveJson(token,`/files?${params.toString()}`);
    const existing = found.files?.[0];
    if (existing?.id) { parent = existing.id; continue; }
    const created = await driveJson(token,'/files?supportsAllDrives=true&fields=id,name,parents',{
      method:'POST',
      body:JSON.stringify({name:segment,mimeType:'application/vnd.google-apps.folder',parents:[parent]}),
    });
    if (!created?.id) throw new Error('CANONICAL_STORAGE_FOLDER_CREATE_FAILED');
    parent = created.id;
  }
  return parent;
}

function concatBytes(...parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
}

export async function canonicalDriveStatus(env = {}) {
  if (!env.DB) return { ready: false, reason: 'db_missing' };
  try {
    const connection = await primaryConnection(env);
    const routes = await env.DB.prepare(`SELECT service_key,folder_name,folder_id FROM storage_routes
      WHERE connection_role='primary' ORDER BY folder_name`).all();
    return {
      ready: true,
      driveId: connection.drive_id,
      driveName: connection.drive_name,
      accountEmail: connection.account_email,
      routes: (routes.results || []).map(route => ({
        serviceKey: route.service_key,
        folderName: route.folder_name,
        ready: Boolean(route.folder_id),
      })),
    };
  } catch (error) {
    return { ready: false, reason: String(error?.message || 'canonical_storage_unavailable') };
  }
}

export async function writeCanonicalDriveFile(env, options = {}) {
  const routeKey = normalizeRouteKey(options.storageRoute || options.serviceId);
  if (!routeKey) throw new Error('CANONICAL_STORAGE_ROUTE_REQUIRED');
  const bytes = options.bytes instanceof Uint8Array ? options.bytes : new Uint8Array(options.bytes || []);
  if (!bytes.length) throw new Error('CANONICAL_STORAGE_CONTENT_REQUIRED');

  const [connection, folder] = await Promise.all([
    primaryConnection(env),
    routeFolder(env, routeKey),
  ]);
  const token = await accessToken(env, connection);
  const mimeType = String(options.mimeType || 'application/octet-stream').slice(0, 120);
  const parentId = await ensureSubfolderPath(token, folder.folder_id, options.subfolderPath || '');
  const metadata = {
    name: safeName(options.title || `record-${Date.now()}`),
    parents: [parentId],
    appProperties: {
      ekodiSpaceId: String(options.spaceId || '').slice(0, 120),
      ekodiServiceId: String(options.serviceId || '').slice(0, 120),
      ekodiStorageRoute: routeKey,
      ekodiRecordType: String(options.recordType || '').slice(0, 120),
      ekodiCreatedBy: String(options.createdBy || '').slice(0, 120),
      ekodiRetention: String(options.retentionClass || '').slice(0, 40),
      ekodiSourceModule: String(options.sourceModuleId || 'ekodi').slice(0, 120),
    },
  };
  const boundary = `ekodi_${crypto.randomUUID().replace(/-/g, '')}`;
  const prefix = encoder.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`);
  const suffix = encoder.encode(`\r\n--${boundary}--`);
  const response = await fetch(`${DRIVE_UPLOAD_URL}?uploadType=multipart&supportsAllDrives=true&fields=id,name,mimeType,webViewLink,parents,createdTime`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': `multipart/related; boundary=${boundary}`,
    },
    body: concatBytes(prefix, bytes, suffix),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`CANONICAL_STORAGE_UPLOAD_${response.status}`);
  return {
    ...result,
    storageRoute: routeKey,
    folderId: folder.folder_id,
    folderName: folder.folder_name,
    canonicalDriveId: connection.drive_id,
    canonicalDriveName: connection.drive_name,
  };
}


export async function writeCanonicalDriveStream(env, options = {}) {
  const routeKey = normalizeRouteKey(options.storageRoute || options.serviceId);
  if (!routeKey) throw new Error('CANONICAL_STORAGE_ROUTE_REQUIRED');
  if (!options.body) throw new Error('CANONICAL_STORAGE_CONTENT_REQUIRED');
  const size = Number(options.size || 0);
  if (!Number.isFinite(size) || size <= 0) throw new Error('CANONICAL_STORAGE_SIZE_REQUIRED');

  const [connection, folder] = await Promise.all([
    primaryConnection(env),
    routeFolder(env, routeKey),
  ]);
  const token = await accessToken(env, connection);
  const mimeType = String(options.mimeType || 'application/octet-stream').slice(0, 120);
  const parentId = await ensureSubfolderPath(token, folder.folder_id, options.subfolderPath || '');
  const metadata = {
    name: safeName(options.title || `record-${Date.now()}`),
    parents: [parentId],
    appProperties: {
      ekodiSpaceId: String(options.spaceId || '').slice(0, 120),
      ekodiServiceId: String(options.serviceId || '').slice(0, 120),
      ekodiStorageRoute: routeKey,
      ekodiRecordType: String(options.recordType || '').slice(0, 120),
      ekodiCreatedBy: String(options.createdBy || '').slice(0, 120),
      ekodiRetention: String(options.retentionClass || '').slice(0, 40),
      ekodiSourceModule: String(options.sourceModuleId || 'ekodi').slice(0, 120),
    },
  };
  const init = await fetch(`${DRIVE_UPLOAD_URL}?uploadType=resumable&supportsAllDrives=true&fields=id,name,mimeType,webViewLink,parents,createdTime`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json; charset=UTF-8',
      'x-upload-content-type': mimeType,
      'x-upload-content-length': String(size),
    },
    body: JSON.stringify(metadata),
  });
  if (!init.ok) throw new Error(`CANONICAL_STORAGE_RESUMABLE_INIT_${init.status}`);
  const location = init.headers.get('location');
  if (!location) throw new Error('CANONICAL_STORAGE_RESUMABLE_LOCATION_MISSING');
  const uploaded = await fetch(location, {
    method: 'PUT',
    headers: {
      'content-type': mimeType,
      'content-length': String(size),
    },
    body: options.body,
  });
  const result = await uploaded.json().catch(() => ({}));
  if (!uploaded.ok || !result.id) throw new Error(`CANONICAL_STORAGE_RESUMABLE_UPLOAD_${uploaded.status}`);
  return {
    ...result,
    storageRoute: routeKey,
    folderId: folder.folder_id,
    folderName: folder.folder_name,
    canonicalDriveId: connection.drive_id,
    canonicalDriveName: connection.drive_name,
  };
}

export async function deleteCanonicalDriveFile(env, fileId = '') {
  const id = String(fileId || '').trim();
  if (!id || !/^[A-Za-z0-9_-]{8,200}$/.test(id)) throw new Error('CANONICAL_STORAGE_FILE_ID_REQUIRED');
  const connection = await primaryConnection(env);
  const token = await accessToken(env, connection);
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?supportsAllDrives=true`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${token}` },
  });
  if (!(response.ok || response.status === 404)) throw new Error(`CANONICAL_STORAGE_DELETE_${response.status}`);
  return { ok: true, id, deleted: true };
}

export const CANONICAL_DRIVE_WRITER_POLICY = Object.freeze({
  canonicalProvider: 'google_workspace_shared_drive',
  canonicalDriveName: 'EKODI',
  credentialsSource: 'encrypted_storage_connections',
  routeSource: 'storage_routes',
  directExternalAccess: false,
});
