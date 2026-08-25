import { handleAdminSessionFastPath } from './admin-session-fastpath.js';

const BASE = '/api/control/storage/google';
const REDIRECT_URI = 'https://drive.ekodi.kr/api/control/storage/google/callback';
const ADMIN_RETURN = 'https://admin.ekodi.kr/#storage';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const SCOPES = [
  'openid', 'email', 'profile',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
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

function splitList(value) { return String(value || '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean); }
function primaryDomains(env) {
  const configured = splitList(env.STORAGE_PRIMARY_GOOGLE_DOMAINS);
  return configured.length ? configured : ['ekodi.kr','ekodibiz.kr'];
}
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
  return {
    account:profile.user,
    drives:[{id:'my-drive',name:'내 드라이브',rootId:root.id,type:'my-drive'}, ...(shared.drives || []).filter(d => !d.hidden).map(d => ({...d,rootId:d.id,type:'shared-drive'}))]
  };
}
async function createFolder(access, name, parentId) {
  return driveFetch(access, '/files?supportsAllDrives=true&fields=id,name,parents', {
    method:'POST', body:JSON.stringify({name,mimeType:'application/vnd.google-apps.folder',parents:[parentId]})
  });
}
async function bootstrap(env, row) {
  if (!row.drive_root_id) throw new Error('저장할 Google Drive를 먼저 선택해 주세요.');
  const access = await accessToken(env,row);
  let archiveRoot = row.archive_root_id;
  if (!archiveRoot) {
    archiveRoot = (await createFolder(access,'EKODI',row.drive_root_id)).id;
    await env.DB.prepare('UPDATE storage_connections SET archive_root_id=?, updated_at=? WHERE id=?').bind(archiveRoot,new Date().toISOString(),row.id).run();
  }
  const routeRows = await env.DB.prepare(`SELECT service_key,folder_name,folder_id FROM storage_routes WHERE connection_role='primary' ORDER BY folder_name`).all();
  const created=[];
  for (const route of routeRows.results || []) {
    if (route.folder_id) { created.push({serviceKey:route.service_key,name:route.folder_name,id:route.folder_id,reused:true}); continue; }
    const folder = await createFolder(access,route.folder_name,archiveRoot);
    await env.DB.prepare('UPDATE storage_routes SET folder_id=?,updated_at=? WHERE service_key=?').bind(folder.id,new Date().toISOString(),route.service_key).run();
    created.push({serviceKey:route.service_key,name:route.folder_name,id:folder.id,reused:false});
  }
  const now = new Date().toISOString();
  await env.DB.prepare(`UPDATE storage_connections SET status='ready',last_verified_at=?,updated_at=? WHERE id=?`).bind(now,now,row.id).run();
  return { archiveRootId:archiveRoot, folders:created };
}

export async function handleGoogleDriveStorageControl(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(BASE)) return null;
  if (!env.DB) return json({error:'Storage registry database unavailable',code:'STORAGE_DB_UNAVAILABLE'},503);
  await ensureSchema(env.DB);

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
      return html(`${email} 계정이 ${payload.role === 'primary' ? 'EKODI 기본 저장소' : '보조 저장소'}로 연결되었습니다. 이제 사용할 Drive를 선택하고 EKODI 폴더를 생성할 수 있습니다.`,true);
    } catch (error) { console.error('Google Drive OAuth callback failed',error); return html('Google Drive 계정 연결 중 오류가 발생했습니다.'); }
  }

  const auth = await adminSession(request,env); if (!auth.session) return auth.response;
  if (url.pathname === `${BASE}/status` && request.method === 'GET') {
    const routes = await env.DB.prepare('SELECT service_key,folder_key,folder_name,folder_id,connection_role,updated_at FROM storage_routes ORDER BY folder_name').all();
    return json({schemaVersion:1,configured:ready(env),primaryDomains:primaryDomains(env),redirectUri:REDIRECT_URI,connections:await connectionRows(env),routes:routes.results || [],policy:{primary:'EKODI Workspace Drive',secondary:'optional Google accounts',webDelivery:'Cloudflare R2 when needed',credentials:'AES-GCM encrypted at rest'}},200,auth.response.headers);
  }
  if (url.pathname === `${BASE}/oauth/start` && request.method === 'POST') {
    if (!ready(env)) return json({error:'Google Drive OAuth Secret 구성이 필요합니다.',code:'GOOGLE_DRIVE_NOT_CONFIGURED'},503,auth.response.headers);
    const body = await request.json().catch(() => ({})); const role = body.role === 'secondary' ? 'secondary' : 'primary';
    const nonce=b64url(crypto.getRandomValues(new Uint8Array(24))); const now=new Date(); const exp=new Date(now.getTime()+10*60*1000);
    await env.DB.prepare('DELETE FROM storage_oauth_states WHERE expires_at<=?').bind(now.toISOString()).run();
    await env.DB.prepare('INSERT INTO storage_oauth_states(nonce_hash,admin_email,connection_role,expires_at,created_at) VALUES(?,?,?,?,?)').bind(await nonceHash(nonce),auth.session.email,role,exp.toISOString(),now.toISOString()).run();
    const state=await signState(env,{nonce,role,adminEmail:auth.session.email,exp:exp.getTime()});
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
    await env.DB.prepare(`UPDATE storage_connections SET drive_id=?,drive_name=?,drive_root_id=?,archive_root_id='',status='connected',last_verified_at=?,updated_at=? WHERE id=?`).bind(selected.id,selected.name,selected.rootId,now,now,row.id).run();
    if (row.role === 'primary') await env.DB.prepare(`UPDATE storage_routes SET folder_id='',connection_role='primary',updated_at=?`).bind(now).run();
    return json({ok:true,drive:selected},200,auth.response.headers);
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
    return json({ok:true},200,auth.response.headers);
  }
  return json({error:'Google Drive Storage endpoint not found'},404,auth.response.headers);
}
