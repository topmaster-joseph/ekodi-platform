import { handleAdminSessionFastPath } from './admin-session-fastpath.js';
import { refreshGoogleAccessToken } from './google-drive-storage-control.js';

const BASE = '/api/control/storage/browser';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const MAX_PAGE_SIZE = 100;
const MAX_ANCESTRY_DEPTH = 64;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function json(data, status = 200, sourceHeaders = new Headers()) {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    vary: 'Origin',
  });
  for (const name of ['access-control-allow-origin','access-control-allow-headers','access-control-allow-methods','access-control-max-age']) {
    const value = sourceHeaders.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(JSON.stringify(data), { status, headers });
}

async function adminSession(request, env) {
  const url = new URL(request.url);
  url.pathname = '/api/session';
  url.search = '';
  const response = await handleAdminSessionFastPath(new Request(url, { method: 'GET', headers: request.headers }), env);
  if (!response?.ok) return { response };
  const session = await response.clone().json();
  if (!session?.authenticated || !['super_admin','operator'].includes(String(session.role || ''))) {
    return { response: json({ error: 'Storage 관리자 권한이 필요합니다.', code: 'STORAGE_FORBIDDEN' }, 403, response.headers) };
  }
  return { response, session };
}

async function sha256(value) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(String(value))));
}

function fromB64url(value) {
  const normal = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normal + '='.repeat((4 - normal.length % 4) % 4));
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

async function aesKey(env) {
  return crypto.subtle.importKey('raw', await sha256(env.STORAGE_CREDENTIAL_KEY), 'AES-GCM', false, ['decrypt']);
}

async function decryptCredential(env, row) {
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64url(row.credential_iv) },
    await aesKey(env),
    fromB64url(row.credential_ciphertext),
  );
  return JSON.parse(decoder.decode(plain));
}

async function rowById(env, id) {
  return env.DB.prepare(`SELECT id,role,account_email,drive_id,drive_name,drive_root_id,archive_root_id,status,credential_ciphertext,credential_iv
    FROM storage_connections WHERE id=? AND status!='disabled'`).bind(id).first();
}

async function accessToken(env, row) {
  if (!env.STORAGE_CREDENTIAL_KEY || !env.GOOGLE_DRIVE_CLIENT_SECRET) throw new Error('STORAGE_BROWSER_NOT_CONFIGURED');
  const credential = await decryptCredential(env, row);
  if (!credential?.refreshToken) throw new Error('GOOGLE_REAUTH_REQUIRED');
  const token = await refreshGoogleAccessToken(env, { refreshToken: credential.refreshToken });
  if (!token?.access_token) throw new Error('GOOGLE_REAUTH_REQUIRED');
  return token.access_token;
}

async function driveFetch(access, path) {
  const response = await fetch(`${DRIVE_API}${path}`, {
    headers: { authorization: `Bearer ${access}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.error?.message || `Google Drive API failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return data;
}

function escapeDriveQuery(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function fileMeta(access, id) {
  return driveFetch(access, `/files/${encodeURIComponent(id)}?supportsAllDrives=true&fields=id,name,mimeType,parents,driveId,trashed`);
}

async function assertWithinSelectedDrive(access, row, candidateId) {
  if (!candidateId || candidateId === row.drive_root_id || candidateId === row.archive_root_id) return;
  if (row.drive_id !== 'my-drive') {
    const meta = await fileMeta(access, candidateId);
    if (meta.trashed || String(meta.driveId || '') !== String(row.drive_id || '')) throw new Error('STORAGE_BROWSER_OUTSIDE_SELECTED_DRIVE');
    return;
  }

  let current = candidateId;
  const visited = new Set();
  for (let depth = 0; depth < MAX_ANCESTRY_DEPTH; depth += 1) {
    if (current === row.drive_root_id) return;
    if (!current || visited.has(current)) break;
    visited.add(current);
    const meta = await fileMeta(access, current);
    if (meta.trashed) break;
    const parents = Array.isArray(meta.parents) ? meta.parents : [];
    current = parents[0] || '';
  }
  throw new Error('STORAGE_BROWSER_OUTSIDE_SELECTED_DRIVE');
}

async function currentFolder(access, row, parentId) {
  if (parentId === row.drive_root_id) return { id: parentId, name: row.drive_name || 'Drive', root: true };
  if (parentId === row.archive_root_id && row.archive_root_id) {
    const meta = await fileMeta(access, parentId);
    return { id: meta.id, name: meta.name || 'EKODI', root: false };
  }
  const meta = await fileMeta(access, parentId);
  return { id: meta.id, name: meta.name || '', root: false };
}

async function listItems(env, row, url) {
  if (!row.drive_id || !row.drive_root_id) throw new Error('STORAGE_DRIVE_NOT_SELECTED');
  const access = await accessToken(env, row);
  const defaultRoot = row.archive_root_id || row.drive_root_id;
  const parentId = String(url.searchParams.get('parentId') || defaultRoot).trim();
  await assertWithinSelectedDrive(access, row, parentId);

  const search = String(url.searchParams.get('q') || '').trim().slice(0, 160);
  const requestedPageSize = Number(url.searchParams.get('pageSize') || 100);
  const pageSize = Number.isFinite(requestedPageSize) ? Math.max(1, Math.min(MAX_PAGE_SIZE, Math.floor(requestedPageSize))) : MAX_PAGE_SIZE;
  const pageToken = String(url.searchParams.get('pageToken') || '').trim().slice(0, 2048);
  const clauses = [
    `'${escapeDriveQuery(parentId)}' in parents`,
    'trashed = false',
  ];
  if (search) clauses.push(`name contains '${escapeDriveQuery(search)}'`);

  const params = new URLSearchParams({
    q: clauses.join(' and '),
    spaces: 'drive',
    pageSize: String(pageSize),
    orderBy: 'name_natural',
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true',
    fields: 'nextPageToken,files(id,name,mimeType,modifiedTime,size,parents,webViewLink,iconLink,thumbnailLink,trashed)',
  });
  if (pageToken) params.set('pageToken', pageToken);
  if (row.drive_id !== 'my-drive') {
    params.set('corpora', 'drive');
    params.set('driveId', row.drive_id);
  }

  const result = await driveFetch(access, `/files?${params.toString()}`);
  const folder = await currentFolder(access, row, parentId);
  const items = (result.files || []).map(item => ({
    id: item.id,
    name: item.name,
    mimeType: item.mimeType,
    kind: item.mimeType === 'application/vnd.google-apps.folder' ? 'folder' : 'file',
    modifiedTime: item.modifiedTime || null,
    size: item.size ? Number(item.size) : null,
    parents: Array.isArray(item.parents) ? item.parents : [],
    webViewLink: item.webViewLink || null,
    iconLink: item.iconLink || null,
    thumbnailLink: item.thumbnailLink || null,
  })).sort((a, b) => (a.kind === b.kind ? String(a.name).localeCompare(String(b.name), 'ko', { numeric: true }) : a.kind === 'folder' ? -1 : 1));

  return {
    ok: true,
    readOnly: true,
    connection: { id: row.id, role: row.role, accountEmail: row.account_email, driveId: row.drive_id, driveName: row.drive_name },
    rootId: defaultRoot,
    folder,
    items,
    nextPageToken: result.nextPageToken || null,
    query: search,
  };
}

function errorResponse(error, headers) {
  const code = String(error?.message || 'STORAGE_BROWSER_ERROR').split(':')[0];
  if (code === 'STORAGE_DRIVE_NOT_SELECTED') return json({ error: '사용할 Google Drive를 먼저 선택해 주세요.', code }, 409, headers);
  if (code === 'STORAGE_BROWSER_OUTSIDE_SELECTED_DRIVE') return json({ error: '선택한 Drive 밖의 항목에는 접근할 수 없습니다.', code }, 403, headers);
  if (code === 'GOOGLE_REAUTH_REQUIRED') return json({ error: 'Google Drive 재인증이 필요합니다.', code, reconnectRole: 'primary' }, 401, headers);
  if (code === 'STORAGE_BROWSER_NOT_CONFIGURED') return json({ error: 'Storage Browser 환경설정이 필요합니다.', code }, 503, headers);
  if (Number(error?.status) === 401) return json({ error: 'Google Drive 재인증이 필요합니다.', code: 'GOOGLE_REAUTH_REQUIRED', reconnectRole: 'primary' }, 401, headers);
  return json({ error: 'Google Drive 파일 목록을 읽을 수 없습니다.', code: 'STORAGE_BROWSER_READ_FAILED' }, 502, headers);
}

export async function handleStorageBrowserControl(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(BASE)) return null;
  if (!env.DB) return json({ error: 'Storage registry database unavailable', code: 'STORAGE_DB_UNAVAILABLE' }, 503);

  let auth;
  try { auth = await adminSession(request, env); }
  catch (error) {
    console.error('Storage browser admin session check failed', error);
    return json({ error: 'Storage admin authentication unavailable', code: 'STORAGE_AUTH_UNAVAILABLE' }, 503);
  }
  if (!auth.session) return auth.response;

  const match = url.pathname.match(new RegExp(`^${BASE}/connections/([^/]+)/items$`));
  if (match && request.method === 'GET') {
    const row = await rowById(env, decodeURIComponent(match[1]));
    if (!row) return json({ error: 'Drive 연결을 찾을 수 없습니다.', code: 'STORAGE_CONNECTION_NOT_FOUND' }, 404, auth.response.headers);
    try { return json(await listItems(env, row, url), 200, auth.response.headers); }
    catch (error) {
      console.error('Storage browser list failed', error);
      return errorResponse(error, auth.response.headers);
    }
  }

  return json({ error: 'Storage Browser endpoint not found', code: 'STORAGE_BROWSER_NOT_FOUND' }, 404, auth.response.headers);
}
