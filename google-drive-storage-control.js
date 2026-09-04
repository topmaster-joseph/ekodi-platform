import { handleAdminSessionFastPath } from './admin-session-fastpath.js';

const BASE = '/api/control/storage/google';
const REDIRECT_URI = 'https://drive.ekodi.kr/api/control/storage/google/callback';
const ADMIN_ORIGIN = 'https://admin.ekodi.kr';
const ADMIN_RETURN_PATH = '/#storage';
const ADMIN_RETURN = `${ADMIN_ORIGIN}${ADMIN_RETURN_PATH}`;
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const CHEONGGYE_SPREADSHEET_ID = '1NNYUFgkle_vzSvR-HWM6EVhvfd5qdgJmF2ZYbK9gtlo';
const CHEONGGYE_SHEET_NAME = '웹관리';
const CHEONGGYE_SCOPE = 'cheonggye-merchant-association';
const CHEONGGYE_CONNECTION_CACHE_KEY = 'control/cheonggye/storage-connection.json';
const CHEONGGYE_ADMIN_SESSION_CACHE_PREFIX = 'control/cheonggye/admin-session/';
const CHEONGGYE_ADMIN_SESSION_FRESH_MS = 5 * 60 * 1000;
const CHEONGGYE_ADMIN_SESSION_STALE_MS = 30 * 60 * 1000;
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const SCOPES = [
  'openid', 'email', 'profile',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
  'https://www.googleapis.com/auth/spreadsheets',
];
const ROUTES = [
  ['core','01_CORE'], ['church','02_CHURCH'], ['biz','03_BIZ'], ['books','04_BOOKS'],
  ['community','05_COMMUNITY'], ['work','06_WORK'], ['education','07_EDUCATION'],
  ['media','08_MEDIA'], ['camp','09_CAMP'], ['backup','99_BACKUP'],
];
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function json(data, status = 200, sourceHeaders = new Headers()) {
  const headers = new Headers({
    'content-type':'application/json; charset=utf-8', 'cache-control':'no-store',
    'x-content-type-options':'nosniff', vary:'Origin',
  });
  for (const name of ['access-control-allow-origin','access-control-allow-headers','access-control-allow-methods','access-control-max-age']) {
    const value = sourceHeaders.get(name); if (value) headers.set(name, value);
  }
  return new Response(JSON.stringify(data), { status, headers });
}

function html(message, ok = false) {
  const title = ok ? 'Google Drive 연결 완료' : 'Google Drive 연결 확인 필요';
  return new Response(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title><body style="font-family:system-ui;padding:32px;max-width:680px;margin:auto"><h1>${title}</h1><p>${message}</p><p><a href="${ADMIN_RETURN}">EKODI 관리자 Storage로 돌아가기</a></p></body></html>`, {
    status:ok ? 200 : 400, headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}
  });
}

function safeAdminReturnPath(value) {
  const candidate = String(value || '').trim();
  if (!candidate || candidate.length > 2048 || !candidate.startsWith('/') || candidate.startsWith('//')) return ADMIN_RETURN_PATH;
  try {
    const target = new URL(candidate, ADMIN_ORIGIN);
    if (target.origin !== ADMIN_ORIGIN) return ADMIN_RETURN_PATH;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch { return ADMIN_RETURN_PATH; }
}
function adminRedirect(returnTo = ADMIN_RETURN_PATH) {
  const location = new URL(safeAdminReturnPath(returnTo), ADMIN_ORIGIN).toString();
  return new Response(null, { status:303, headers:{ location, 'cache-control':'no-store', 'referrer-policy':'no-referrer' } });
}

function splitList(value) { return String(value || '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean); }
function primaryDomains(env) {
  const configured = splitList(env.STORAGE_PRIMARY_GOOGLE_DOMAINS);
  return configured.length ? configured : ['ekodi.kr'];
}
function primarySharedDriveId(env) { return String(env.STORAGE_PRIMARY_SHARED_DRIVE_ID || '').trim(); }
function primarySharedDriveName(env) { return String(env.STORAGE_PRIMARY_SHARED_DRIVE_NAME || 'EKODI').trim() || 'EKODI'; }
function googleClientId(env) { return String(env.GOOGLE_DRIVE_CLIENT_ID || env.GOOGLE_CLIENT_ID || '').trim(); }
function ready(env) { return Boolean(googleClientId(env) && env.GOOGLE_DRIVE_CLIENT_SECRET && env.STORAGE_CREDENTIAL_KEY && env.DB); }
function b64url(bytes) {
  let binary=''; for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');
}
function fromB64url(value) {
  const normal = String(value).replace(/-/g,'+').replace(/_/g,'/');
  const binary = atob(normal + '='.repeat((4-normal.length%4)%4));
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}
async function sha256(value) { return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(String(value)))); }
async function hmacKey(env) { return crypto.subtle.importKey('raw', await sha256(env.STORAGE_CREDENTIAL_KEY), {name:'HMAC',hash:'SHA-256'}, false, ['sign','verify']); }
async function signState(env, payload) {
  const body = b64url(encoder.encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(env), encoder.encode(body)));
  return `${body}.${b64url(sig)}`;
}
async function readState(env, state) {
  const [body, sig] = String(state || '').split('.');
  if (!body || !sig) return null;
  const ok = await crypto.subtle.verify('HMAC', await hmacKey(env), fromB64url(sig), encoder.encode(body));
  if (!ok) return null;
  try { return JSON.parse(decoder.decode(fromB64url(body))); } catch { return null; }
}
async function aesKey(env) { return crypto.subtle.importKey('raw', await sha256(env.STORAGE_CREDENTIAL_KEY), 'AES-GCM', false, ['encrypt','decrypt']); }
async function encryptCredential(env, value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv}, await aesKey(env), encoder.encode(JSON.stringify(value))));
  return { ciphertext:b64url(cipher), iv:b64url(iv) };
}
async function decryptCredential(env, row) {
  const plain = await crypto.subtle.decrypt({name:'AES-GCM',iv:fromB64url(row.credential_iv)}, await aesKey(env), fromB64url(row.credential_ciphertext));
  return JSON.parse(decoder.decode(plain));
}
async function nonceHash(value) { return b64url(await sha256(value)); }

async function ensureSchema(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS storage_connections (id TEXT PRIMARY KEY, provider TEXT NOT NULL DEFAULT 'google_drive', role TEXT NOT NULL, account_email TEXT NOT NULL, account_domain TEXT NOT NULL DEFAULT '', display_name TEXT NOT NULL DEFAULT '', drive_id TEXT NOT NULL DEFAULT '', drive_name TEXT NOT NULL DEFAULT '', drive_root_id TEXT NOT NULL DEFAULT '', archive_root_id TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'connected', credential_ciphertext TEXT NOT NULL, credential_iv TEXT NOT NULL, scopes TEXT NOT NULL DEFAULT '', created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_verified_at TEXT)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS storage_routes (service_key TEXT PRIMARY KEY, folder_key TEXT NOT NULL, folder_name TEXT NOT NULL, folder_id TEXT NOT NULL DEFAULT '', connection_role TEXT NOT NULL DEFAULT 'primary', updated_at TEXT NOT NULL)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS storage_oauth_states (nonce_hash TEXT PRIMARY KEY, admin_email TEXT NOT NULL, connection_role TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS cheonggye_member_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT NOT NULL, member_no INTEGER, admin_email TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL)`),
  ]);
  const now = new Date().toISOString();
  const seed = db.prepare(`INSERT OR IGNORE INTO storage_routes(service_key,folder_key,folder_name,connection_role,updated_at) VALUES(?,?,?,'primary',?)`);
  await db.batch(ROUTES.map(([key,name]) => seed.bind(key,name,name,now)));
}
async function adminSession(request, env) {
  const url = new URL(request.url); url.pathname='/api/session'; url.search='';
  const response = await handleAdminSessionFastPath(new Request(url, {method:'GET',headers:request.headers}), env);
  if (!response?.ok) return { response };
  const session = await response.clone().json();
  if (!session?.authenticated || !['super_admin','operator'].includes(String(session.role || ''))) return { response:json({error:'Storage 관리자 권한이 필요합니다.',code:'STORAGE_FORBIDDEN'},403,response.headers) };
  return { response, session };
}
function cheonggyeBearerToken(request) {
  const authorization = request.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) return '';
  const token = authorization.slice(7);
  return token && token.length <= 256 ? token : '';
}
async function cheonggyeAdminSessionCacheKey(request) {
  const token = cheonggyeBearerToken(request);
  return token ? `${CHEONGGYE_ADMIN_SESSION_CACHE_PREFIX}${b64url(await sha256(token))}.json` : '';
}
async function readCheonggyeAdminSessionCache(env, key) {
  if (!env.R2_BUCKET || !key) return null;
  try { const object=await env.R2_BUCKET.get(key); return object ? await object.json() : null; }
  catch(error) { console.error('Cheonggye admin session cache read failed',error); return null; }
}
async function writeCheonggyeAdminSessionCache(env, key, session) {
  if (!env.R2_BUCKET || !key || !session?.authenticated || !session?.expiresAt) return;
  const cached={authenticated:true,email:String(session.email||''),role:String(session.role||''),expiresAt:String(session.expiresAt),validatedAt:new Date().toISOString()};
  await env.R2_BUCKET.put(key,JSON.stringify(cached),{httpMetadata:{contentType:'application/json'}});
}
function cheonggyeCachedAdminResult(cached) {
  const session={authenticated:true,email:String(cached.email||''),role:String(cached.role||''),expiresAt:String(cached.expiresAt||'')};
  return { response:json(session,200), session };
}
async function cheonggyeAdminSession(request,env) {
  const key=await cheonggyeAdminSessionCacheKey(request);
  if(!key)return {response:json({authenticated:false},401)};
  const cached=await readCheonggyeAdminSessionCache(env,key);
  const now=Date.now();
  const expiresAt=Date.parse(String(cached?.expiresAt||''));
  const validatedAt=Date.parse(String(cached?.validatedAt||''));
  const valid=Boolean(cached?.authenticated && ['super_admin','operator'].includes(String(cached.role||'')) && Number.isFinite(expiresAt) && expiresAt>now);
  const cacheAge=Number.isFinite(validatedAt) ? now-validatedAt : Number.POSITIVE_INFINITY;
  const fresh=valid && cacheAge<CHEONGGYE_ADMIN_SESSION_FRESH_MS;
  const outageFallbackAllowed=valid && cacheAge<CHEONGGYE_ADMIN_SESSION_STALE_MS;
  if(fresh)return cheonggyeCachedAdminResult(cached);
  try {
    const result=await adminSession(request,env);
    if(result.session){await writeCheonggyeAdminSessionCache(env,key,result.session);return result;}
    if(outageFallbackAllowed && Number(result.response?.status||0)>=500){console.warn('Cheonggye admin session using bounded cached validation during D1 outage');return cheonggyeCachedAdminResult(cached);}
    return result;
  } catch(error) {
    if(outageFallbackAllowed){console.warn('Cheonggye admin session using bounded cached validation after D1 exception',error);return cheonggyeCachedAdminResult(cached);}
    throw error;
  }
}
async function tokenRequest(env, body) {
  const response = await fetch(TOKEN_URL, { method:'POST', headers:{'content-type':'application/x-www-form-urlencoded'}, body:new URLSearchParams(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Google OAuth token exchange failed (${response.status})`);
  return data;
}
async function accessToken(env, row) {
  const credential = await decryptCredential(env, row);
  if (!credential.refreshToken) throw new Error('Google refresh token missing');
  const token = await tokenRequest(env, {
    client_id:googleClientId(env), client_secret:String(env.GOOGLE_DRIVE_CLIENT_SECRET),
    refresh_token:credential.refreshToken, grant_type:'refresh_token'
  });
  return token.access_token;
}
async function driveFetch(access, path, init = {}) {
  const headers = new Headers(init.headers || {}); headers.set('authorization', `Bearer ${access}`);
  if (init.body && !headers.has('content-type')) headers.set('content-type','application/json');
  const response = await fetch(`${DRIVE_API}${path}`, {...init,headers});
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Google Drive API failed (${response.status})`);
  return data;
}
async function about(access) { return driveFetch(access, '/about?fields=user(displayName,emailAddress,permissionId),storageQuota'); }
async function sheetsFetch(access, path, init = {}) {
  const headers = new Headers(init.headers || {}); headers.set('authorization', `Bearer ${access}`);
  if (init.body && !headers.has('content-type')) headers.set('content-type','application/json');
  const response = await fetch(`${SHEETS_API}${path}`, {...init,headers});
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(data?.error?.message || `Google Sheets API failed (${response.status})`); error.status=response.status; throw error; }
  return data;
}
function sheetRange(range) { return encodeURIComponent(`'${CHEONGGYE_SHEET_NAME}'!${range}`); }
async function readCheonggyeConnectionCache(env) {
  if (!env.R2_BUCKET) return null;
  try { const object = await env.R2_BUCKET.get(CHEONGGYE_CONNECTION_CACHE_KEY); return object ? await object.json() : null; }
  catch (error) { console.error('Cheonggye connection cache read failed', error); return null; }
}
async function writeCheonggyeConnectionCache(env, row) {
  if (!env.R2_BUCKET || !row?.credential_ciphertext || !row?.credential_iv) return;
  const payload = { id:row.id || '', role:'primary', status:row.status || 'ready', credential_ciphertext:row.credential_ciphertext, credential_iv:row.credential_iv, cachedAt:new Date().toISOString() };
  await env.R2_BUCKET.put(CHEONGGYE_CONNECTION_CACHE_KEY, JSON.stringify(payload), { httpMetadata:{ contentType:'application/json' } });
}
async function primaryStorageConnection(env) {
  const cached = await readCheonggyeConnectionCache(env);
  if (cached?.credential_ciphertext && cached?.credential_iv) return cached;
  if (!env.DB) return null;
  const row = await env.DB.prepare(`SELECT * FROM storage_connections WHERE role='primary' AND status IN ('ready','connected') ORDER BY updated_at DESC LIMIT 1`).first();
  if (row) await writeCheonggyeConnectionCache(env,row).catch(error => console.error('Cheonggye connection cache warm failed',error));
  return row;
}
async function cheonggyeAccess(env) {
  const row = await primaryStorageConnection(env);
  if (!row) throw new Error('CGMA_PRIMARY_GOOGLE_DRIVE_NOT_READY');
  return { row, access: await accessToken(env,row) };
}
async function cheonggyeValues(env) {
  const { access } = await cheonggyeAccess(env);
  const data = await sheetsFetch(access, `/${CHEONGGYE_SPREADSHEET_ID}/values/${sheetRange('A:F')}?majorDimension=ROWS`);
  return { access, values:Array.isArray(data.values) ? data.values : [] };
}
function parseCheonggye(values) {
  return values.slice(1).map((row,index) => ({ sheetRow:index+2, no:Number(row[0]||0), joinedAt:String(row[1]||''), category:String(row[2]||''), store:String(row[3]||''), name:String(row[4]||''), note:String(row[5]||'') }))
    .filter(row => row.no || row.joinedAt || row.category || row.store || row.name || row.note);
}
function normalizeMember(body = {}) {
  return { joinedAt:String(body.joinedAt||'').trim(), category:String(body.category||'').trim(), store:String(body.store||'').trim(), name:String(body.name||'').trim(), note:String(body.note||'').trim() };
}
async function cheonggyeAudit(env, session, action, memberNo, detail = '') {
  const createdAt = new Date().toISOString();
  const event = { scope:CHEONGGYE_SCOPE, action, memberNo:memberNo||null, adminEmail:String(session?.email||''), detail:String(detail).slice(0,500), createdAt };
  if (env.R2_BUCKET) {
    const day = createdAt.slice(0,10).replaceAll('-','/');
    const key = `audit/cheonggye-members/${day}/${createdAt.replaceAll(':','-')}-${crypto.randomUUID()}.json`;
    try { await env.R2_BUCKET.put(key, JSON.stringify(event), { httpMetadata:{ contentType:'application/json' } }); } catch(error) { console.error('Cheonggye R2 audit failed',error); }
  }
  if (env.DB) {
    try { await env.DB.prepare(`INSERT INTO cheonggye_member_audit(action,member_no,admin_email,detail,created_at) VALUES(?,?,?,?,?)`).bind(action,memberNo||null,event.adminEmail,event.detail,createdAt).run(); }
    catch(error) { console.error('Cheonggye D1 audit unavailable; R2 audit retained',error); }
  }
}
async function cheonggyeList(env) { const { values } = await cheonggyeValues(env); return parseCheonggye(values); }
async function cheonggyeAppend(env, member) {
  const { access, values } = await cheonggyeValues(env); const members=parseCheonggye(values);
  const nextNo=members.reduce((max,row)=>Math.max(max,Number(row.no||0)),0)+1;
  const body=JSON.stringify({values:[[nextNo,member.joinedAt,member.category,member.store,member.name,member.note]]});
  await sheetsFetch(access, `/${CHEONGGYE_SPREADSHEET_ID}/values/${sheetRange('A:F')}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {method:'POST',body});
  return nextNo;
}
async function cheonggyeUpdate(env, no, member) {
  const { access, values }=await cheonggyeValues(env); const target=parseCheonggye(values).find(row=>Number(row.no)===Number(no));
  if(!target)return false;
  const range=sheetRange(`A${target.sheetRow}:F${target.sheetRow}`);
  const body=JSON.stringify({range:`'${CHEONGGYE_SHEET_NAME}'!A${target.sheetRow}:F${target.sheetRow}`,majorDimension:'ROWS',values:[[no,member.joinedAt,member.category,member.store,member.name,member.note]]});
  await sheetsFetch(access, `/${CHEONGGYE_SPREADSHEET_ID}/values/${range}?valueInputOption=USER_ENTERED`, {method:'PUT',body}); return true;
}
async function cheonggyeDelete(env, no) {
  const { access, values }=await cheonggyeValues(env); const target=parseCheonggye(values).find(row=>Number(row.no)===Number(no));
  if(!target)return false;
  const meta=await sheetsFetch(access, `/${CHEONGGYE_SPREADSHEET_ID}?fields=sheets(properties(sheetId,title))`);
  const sheet=(meta.sheets||[]).find(item=>item.properties?.title===CHEONGGYE_SHEET_NAME); if(!sheet)throw new Error('CGMA_SHEET_TAB_NOT_FOUND');
  const body=JSON.stringify({requests:[{deleteDimension:{range:{sheetId:sheet.properties.sheetId,dimension:'ROWS',startIndex:target.sheetRow-1,endIndex:target.sheetRow}}}]});
  await sheetsFetch(access, `/${CHEONGGYE_SPREADSHEET_ID}:batchUpdate`, {method:'POST',body}); return true;
}
async function connectionRows(env) {
  const rows = await env.DB.prepare(`SELECT id,provider,role,account_email,account_domain,display_name,drive_id,drive_name,drive_root_id,archive_root_id,status,scopes,created_by,created_at,updated_at,last_verified_at FROM storage_connections WHERE status != 'disabled' ORDER BY CASE role WHEN 'primary' THEN 0 ELSE 1 END, created_at`).all();
  return rows.results || [];
}
async function rowById(env, id) { return env.DB.prepare('SELECT * FROM storage_connections WHERE id=? AND status != ?').bind(id,'disabled').first(); }

async function listDrives(env, row) {
  const access = await accessToken(env,row);
  const [profile, shared] = await Promise.all([
    about(access), driveFetch(access, '/drives?pageSize=100&fields=drives(id,name,createdTime,hidden,capabilities(canAddChildren,canManageMembers))')
  ]);
  const root = await driveFetch(access, '/files/root?fields=id,name&supportsAllDrives=true');
  const preferredId = primarySharedDriveId(env);
  const sharedDrives = (shared.drives || [])
    .filter(d => !d.hidden)
    .map(d => ({...d,rootId:d.id,type:'shared-drive',preferred:Boolean(preferredId && d.id === preferredId)}))
    .sort((a,b) => Number(b.preferred) - Number(a.preferred) || String(a.name).localeCompare(String(b.name),'ko'));
  return {
    account:profile.user,
    drives:[{id:'my-drive',name:'내 드라이브',rootId:root.id,type:'my-drive',preferred:false}, ...sharedDrives]
  };
}
async function createFolder(access, name, parentId) {
  return driveFetch(access, '/files?supportsAllDrives=true&fields=id,name,parents', {
    method:'POST', body:JSON.stringify({name,mimeType:'application/vnd.google-apps.folder',parents:[parentId]})
  });
}
function driveQueryValue(value) { return String(value).replace(/\\/g,'\\\\').replace(/'/g,"\\'"); }
async function findFolder(access, name, parentId) {
  const q = `'${driveQueryValue(parentId)}' in parents and name = '${driveQueryValue(name)}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const params = new URLSearchParams({
    q, spaces:'drive', pageSize:'10',
    supportsAllDrives:'true', includeItemsFromAllDrives:'true',
    fields:'files(id,name,parents)',
  });
  const result = await driveFetch(access, `/files?${params}`);
  return (result.files || [])[0] || null;
}
function isCanonicalSharedDrive(env, row) {
  const configuredId = primarySharedDriveId(env);
  return row.role === 'primary' && row.drive_id && row.drive_id !== 'my-drive' && (
    (configuredId && row.drive_id === configuredId) ||
    (!configuredId && String(row.drive_name || '').trim().toLowerCase() === primarySharedDriveName(env).toLowerCase())
  );
}
async function bootstrap(env, row) {
  if (!row.drive_root_id) throw new Error('저장할 Google Drive를 먼저 선택해 주세요.');
  const access = await accessToken(env,row);
  let archiveRoot = row.archive_root_id;
  if (!archiveRoot) {
    if (isCanonicalSharedDrive(env,row)) {
      archiveRoot = row.drive_root_id;
    } else {
      const existingArchive = await findFolder(access,'EKODI',row.drive_root_id);
      archiveRoot = existingArchive?.id || (await createFolder(access,'EKODI',row.drive_root_id)).id;
    }
    await env.DB.prepare('UPDATE storage_connections SET archive_root_id=?, updated_at=? WHERE id=?').bind(archiveRoot,new Date().toISOString(),row.id).run();
  }
  const routeRows = await env.DB.prepare(`SELECT service_key,folder_name,folder_id FROM storage_routes WHERE connection_role='primary' ORDER BY folder_name`).all();
  const created=[];
  for (const route of routeRows.results || []) {
    if (route.folder_id) { created.push({serviceKey:route.service_key,name:route.folder_name,id:route.folder_id,reused:true}); continue; }
    const existing = await findFolder(access,route.folder_name,archiveRoot);
    const folder = existing || await createFolder(access,route.folder_name,archiveRoot);
    await env.DB.prepare('UPDATE storage_routes SET folder_id=?,updated_at=? WHERE service_key=?').bind(folder.id,new Date().toISOString(),route.service_key).run();
    created.push({serviceKey:route.service_key,name:route.folder_name,id:folder.id,reused:Boolean(existing)});
  }
  const now = new Date().toISOString();
  await env.DB.prepare(`UPDATE storage_connections SET status='ready',last_verified_at=?,updated_at=? WHERE id=?`).bind(now,now,row.id).run();
  return { archiveRootId:archiveRoot, folders:created };
}

export async function handleGoogleDriveStorageControl(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(BASE)) return null;
  const isCheonggyeRoute = url.pathname.startsWith(`${BASE}/cheonggye-members`);
  if (!isCheonggyeRoute) {
    if (!env.DB) return json({error:'Storage registry database unavailable',code:'STORAGE_DB_UNAVAILABLE'},503);
    await ensureSchema(env.DB);
  }

  if (url.pathname === `${BASE}/callback` && request.method === 'GET') {
    if (!ready(env)) return html('Google Drive OAuth 환경설정이 아직 준비되지 않았습니다.');
    const payload = await readState(env,url.searchParams.get('state'));
    const code = url.searchParams.get('code');
    if (!payload || !code || Number(payload.exp || 0) < Date.now()) return html('연결 요청이 만료되었거나 올바르지 않습니다.');
    const hash = await nonceHash(payload.nonce);
    const stateRow = await env.DB.prepare('SELECT * FROM storage_oauth_states WHERE nonce_hash=? AND expires_at>?').bind(hash,new Date().toISOString()).first();
    if (!stateRow) return html('이미 사용되었거나 만료된 연결 요청입니다.');
    await env.DB.prepare('DELETE FROM storage_oauth_states WHERE nonce_hash=?').bind(hash).run();
    try {
      const token = await tokenRequest(env,{client_id:googleClientId(env),client_secret:String(env.GOOGLE_DRIVE_CLIENT_SECRET),code,grant_type:'authorization_code',redirect_uri:REDIRECT_URI});
      if (!token.refresh_token) return html('Google에서 장기 연결용 refresh token을 받지 못했습니다. 연결을 다시 시도해 주세요.');
      const profile = await about(token.access_token);
      const email = String(profile.user?.emailAddress || '').trim().toLowerCase();
      const domain = email.split('@')[1] || '';
      if (payload.role === 'primary' && !primaryDomains(env).includes(domain)) return html(`기본 Drive는 ${primaryDomains(env).join(', ')} 조직 계정으로만 연결할 수 있습니다.`);
      const encrypted = await encryptCredential(env,{refreshToken:token.refresh_token});
      const id = crypto.randomUUID(); const now = new Date().toISOString();
      if (payload.role === 'primary') await env.DB.prepare(`UPDATE storage_connections SET status='disabled',updated_at=? WHERE role='primary' AND status!='disabled'`).bind(now).run();
      await env.DB.prepare(`INSERT INTO storage_connections(id,provider,role,account_email,account_domain,display_name,status,credential_ciphertext,credential_iv,scopes,created_by,created_at,updated_at,last_verified_at) VALUES(?,'google_drive',?,?,?,?, 'connected',?,?,?,?,?,?,?)`)
        .bind(id,payload.role,email,domain,String(profile.user?.displayName || ''),encrypted.ciphertext,encrypted.iv,SCOPES.join(' '),payload.adminEmail,now,now,now).run();
      if (payload.role === 'primary') await writeCheonggyeConnectionCache(env,{id,status:'connected',credential_ciphertext:encrypted.ciphertext,credential_iv:encrypted.iv});
      return adminRedirect(payload.returnTo);
    } catch (error) { console.error('Google Drive OAuth callback failed',error); return html('Google Drive 계정 연결 중 오류가 발생했습니다.'); }
  }

  if (url.pathname === `${BASE}/cheonggye-members/health` && request.method === 'GET') {
    try { const members=await cheonggyeList(env); return json({ok:true,scope:CHEONGGYE_SCOPE,source:'google-sheets',sheet:CHEONGGYE_SHEET_NAME,count:members.length,checkedAt:new Date().toISOString()}); }
    catch(error){ console.error('Cheonggye member health failed',error); return json({ok:false,scope:CHEONGGYE_SCOPE,source:'google-sheets',code:'CHEONGGYE_SHEET_UNAVAILABLE'},503); }
  }
  let auth;
  try { auth=isCheonggyeRoute ? await cheonggyeAdminSession(request,env) : await adminSession(request,env); }
  catch(error) { console.error('Storage admin session check failed',error); return json({error:'Storage admin authentication unavailable',code:'STORAGE_AUTH_UNAVAILABLE'},503); }
  if (!auth.session) return auth.response;
  if (url.pathname === `${BASE}/cheonggye-members` && request.method === 'GET') {
    try { const members=await cheonggyeList(env); return json({ok:true,scope:CHEONGGYE_SCOPE,members,count:members.length,source:'google-sheets',sourceUrl:`https://docs.google.com/spreadsheets/d/${CHEONGGYE_SPREADSHEET_ID}/edit`,checkedAt:new Date().toISOString()},200,auth.response.headers); }
    catch(error){console.error('Cheonggye member list failed',error);return json({error:'청계면상인회 Google Sheet를 읽을 수 없습니다.',code:'CHEONGGYE_SHEET_READ_FAILED'},502,auth.response.headers);}
  }
  if (url.pathname === `${BASE}/cheonggye-members` && request.method === 'POST') {
    const member=normalizeMember(await request.json().catch(()=>({})));
    if(!member.joinedAt||!member.category||!member.store||!member.name)return json({error:'가입일, 업종, 상호, 성명을 확인해 주세요.',code:'CHEONGGYE_MEMBER_INVALID'},400,auth.response.headers);
    try{const no=await cheonggyeAppend(env,member);await cheonggyeAudit(env,auth.session,'create',no,`${member.store}/${member.name}`);return json({ok:true,no},201,auth.response.headers);}
    catch(error){console.error('Cheonggye member create failed',error);return json({error:'Google Sheet에 회원을 등록하지 못했습니다.',code:'CHEONGGYE_SHEET_WRITE_FAILED'},502,auth.response.headers);}
  }
  const cheonggyeMemberMatch=url.pathname.match(new RegExp(`^${BASE}/cheonggye-members/(\\d+)$`));
  if(cheonggyeMemberMatch&&request.method==='PUT'){
    const no=Number(cheonggyeMemberMatch[1]);const member=normalizeMember(await request.json().catch(()=>({})));
    if(!member.joinedAt||!member.category||!member.store||!member.name)return json({error:'가입일, 업종, 상호, 성명을 확인해 주세요.',code:'CHEONGGYE_MEMBER_INVALID'},400,auth.response.headers);
    try{const found=await cheonggyeUpdate(env,no,member);if(!found)return json({error:'회원 번호를 찾을 수 없습니다.',code:'CHEONGGYE_MEMBER_NOT_FOUND'},404,auth.response.headers);await cheonggyeAudit(env,auth.session,'update',no,`${member.store}/${member.name}`);return json({ok:true,no},200,auth.response.headers);}
    catch(error){console.error('Cheonggye member update failed',error);return json({error:'Google Sheet의 회원 정보를 수정하지 못했습니다.',code:'CHEONGGYE_SHEET_WRITE_FAILED'},502,auth.response.headers);}
  }
  if(cheonggyeMemberMatch&&request.method==='DELETE'){
    const no=Number(cheonggyeMemberMatch[1]);
    try{const found=await cheonggyeDelete(env,no);if(!found)return json({error:'회원 번호를 찾을 수 없습니다.',code:'CHEONGGYE_MEMBER_NOT_FOUND'},404,auth.response.headers);await cheonggyeAudit(env,auth.session,'delete',no,'member row deleted');return json({ok:true,no},200,auth.response.headers);}
    catch(error){console.error('Cheonggye member delete failed',error);return json({error:'Google Sheet의 회원 정보를 삭제하지 못했습니다.',code:'CHEONGGYE_SHEET_WRITE_FAILED'},502,auth.response.headers);}
  }
  if (url.pathname === `${BASE}/status` && request.method === 'GET') {
    const routes = await env.DB.prepare('SELECT service_key,folder_key,folder_name,folder_id,connection_role,updated_at FROM storage_routes ORDER BY folder_name').all();
    return json({schemaVersion:1,configured:ready(env),primaryDomains:primaryDomains(env),primarySharedDrive:{id:primarySharedDriveId(env),name:primarySharedDriveName(env)},redirectUri:REDIRECT_URI,connections:await connectionRows(env),routes:routes.results || [],policy:{primary:'Google Workspace Shared Drive EKODI',secondary:'optional Google accounts',webDelivery:'Cloudflare R2 when needed',credentials:'AES-GCM encrypted at rest'}},200,auth.response.headers);
  }
  if (url.pathname === `${BASE}/oauth/start` && request.method === 'POST') {
    if (!ready(env)) return json({error:'Google Drive OAuth Secret 구성이 필요합니다.',code:'GOOGLE_DRIVE_NOT_CONFIGURED'},503,auth.response.headers);
    const body = await request.json().catch(() => ({})); const role = body.role === 'secondary' ? 'secondary' : 'primary'; const returnTo = safeAdminReturnPath(body.returnTo);
    const nonce=b64url(crypto.getRandomValues(new Uint8Array(24))); const now=new Date(); const exp=new Date(now.getTime()+10*60*1000);
    await env.DB.prepare('DELETE FROM storage_oauth_states WHERE expires_at<=?').bind(now.toISOString()).run();
    await env.DB.prepare('INSERT INTO storage_oauth_states(nonce_hash,admin_email,connection_role,expires_at,created_at) VALUES(?,?,?,?,?)').bind(await nonceHash(nonce),auth.session.email,role,exp.toISOString(),now.toISOString()).run();
    const state=await signState(env,{nonce,role,adminEmail:auth.session.email,returnTo,exp:exp.getTime()});
    const params=new URLSearchParams({client_id:googleClientId(env),redirect_uri:REDIRECT_URI,response_type:'code',access_type:'offline',prompt:'consent',include_granted_scopes:'true',scope:SCOPES.join(' '),state});
    return json({authorizeUrl:`${AUTH_URL}?${params}`,role},200,auth.response.headers);
  }
  const driveMatch=url.pathname.match(new RegExp(`^${BASE}/connections/([^/]+)/drives$`));
  if (driveMatch && request.method === 'GET') {
    const row=await rowById(env,decodeURIComponent(driveMatch[1])); if (!row) return json({error:'Drive 연결을 찾을 수 없습니다.'},404,auth.response.headers);
    try { return json(await listDrives(env,row),200,auth.response.headers); } catch(error) { console.error('Drive list failed',error); return json({error:'Google Drive 목록을 읽을 수 없습니다.',code:'DRIVE_LIST_FAILED'},502,auth.response.headers); }
  }
  const selectMatch=url.pathname.match(new RegExp(`^${BASE}/connections/([^/]+)/select$`));
  if (selectMatch && request.method === 'POST') {
    const row=await rowById(env,decodeURIComponent(selectMatch[1])); if (!row) return json({error:'Drive 연결을 찾을 수 없습니다.'},404,auth.response.headers);
    const body=await request.json().catch(() => ({})); const available=await listDrives(env,row); const selected=available.drives.find(d => d.id === String(body.driveId || ''));
    if (!selected) return json({error:'이 계정에서 사용할 수 없는 Drive입니다.'},400,auth.response.headers);
    const now=new Date().toISOString();
    const canonicalRoot = row.role === 'primary' && selected.id === primarySharedDriveId(env) ? selected.rootId : '';
    await env.DB.prepare(`UPDATE storage_connections SET drive_id=?,drive_name=?,drive_root_id=?,archive_root_id=?,status='connected',last_verified_at=?,updated_at=? WHERE id=?`).bind(selected.id,selected.name,selected.rootId,canonicalRoot,now,now,row.id).run();
    if (row.role === 'primary') await env.DB.prepare(`UPDATE storage_routes SET folder_id='',connection_role='primary',updated_at=?`).bind(now).run();
    return json({ok:true,drive:selected,archiveRootId:canonicalRoot || null},200,auth.response.headers);
  }
  const bootstrapMatch=url.pathname.match(new RegExp(`^${BASE}/connections/([^/]+)/bootstrap$`));
  if (bootstrapMatch && request.method === 'POST') {
    const row=await rowById(env,decodeURIComponent(bootstrapMatch[1])); if (!row) return json({error:'Drive 연결을 찾을 수 없습니다.'},404,auth.response.headers);
    if (row.role !== 'primary') return json({error:'EKODI 기본 폴더 구조는 primary Drive에만 생성합니다.'},409,auth.response.headers);
    try { return json({ok:true,...await bootstrap(env,row)},200,auth.response.headers); } catch(error) { console.error('Drive bootstrap failed',error); return json({error:String(error.message || 'Drive 폴더 생성 실패'),code:'DRIVE_BOOTSTRAP_FAILED'},502,auth.response.headers); }
  }
  const disconnectMatch=url.pathname.match(new RegExp(`^${BASE}/connections/([^/]+)$`));
  if (disconnectMatch && request.method === 'DELETE') {
    const row=await rowById(env,decodeURIComponent(disconnectMatch[1])); if (!row) return json({error:'Drive 연결을 찾을 수 없습니다.'},404,auth.response.headers);
    await env.DB.prepare(`UPDATE storage_connections SET status='disabled',credential_ciphertext='',credential_iv='',updated_at=? WHERE id=?`).bind(new Date().toISOString(),row.id).run();
    if (row.role === 'primary' && env.R2_BUCKET) await env.R2_BUCKET.delete(CHEONGGYE_CONNECTION_CACHE_KEY);
    return json({ok:true},200,auth.response.headers);
  }
  return json({error:'Google Drive Storage endpoint not found'},404,auth.response.headers);
}
