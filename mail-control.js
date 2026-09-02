import { decryptMailCredential, encryptMailCredential, mailCredentialReady, mailNonceHash, readMailState, signMailState } from './mail-credential-vault.js';
import { exchangeGoogleMailCode, getGoogleMailMessage, googleMailAuthorizeUrl, googleMailConfigured, googleMailProfile, hasGoogleReadScope, hasGoogleSendScope, listGoogleMailMessages, refreshGoogleMailToken, sendGoogleMailMessage } from './mail-google-adapter.js';
const SUPABASE_URL = 'https://renzehysxirjilvdxacv.supabase.co';
const DEFAULT_PUBLISHABLE_KEY = 'sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const MAIL_PREFIX = '/api/mail/control';
const WRITE_ROLES = new Set(['tenant_admin', 'owner', 'admin', 'manager', 'store_owner']);
const ALLOWED_ORIGINS = new Set(['https://ekodi.kr', 'https://mail.ekodi.kr', 'https://my.ekodi.kr']);
const DEFAULT_PROVIDER = 'forward-email';
const ACCOUNT_PROVIDERS = Object.freeze({
  gmail: { label: 'Gmail', connectorMode: 'google-oauth', auth: 'oauth', read: true, send: true, externalVerification: 'google-restricted-scope-review' },
  outlook: { label: 'Outlook / Microsoft', connectorMode: 'microsoft-oauth', auth: 'oauth', read: true, send: true },
  naver: { label: 'Naver Mail', connectorMode: 'imap-adapter', auth: 'provider-app-password-or-oauth', read: true, send: true },
  daum: { label: 'Daum Mail', connectorMode: 'imap-adapter', auth: 'provider-app-password-or-oauth', read: true, send: true },
  kakao: { label: 'Kakao Mail', connectorMode: 'imap-adapter', auth: 'provider-app-password-or-oauth', read: true, send: true },
  'generic-imap': { label: '기타 IMAP 메일', connectorMode: 'imap-adapter', auth: 'oauth-or-app-password', read: true, send: true },
  'workspace-delegation': { label: 'Google Workspace 위임', connectorMode: 'workspace-delegation', auth: 'service-account', read: true, send: false },
});

function cors(origin) {
  const headers = {
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) headers['access-control-allow-origin'] = origin;
  return headers;
}

function json(data, status, request) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      ...cors(request.headers.get('origin')),
    },
  });
}

function bearer(request) {
  const value = String(request.headers.get('authorization') || '');
  return value.toLowerCase().startsWith('bearer ') ? value.slice(7).trim() : '';
}

function normalizeSlug(value) {
  const slug = String(value || '').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-]{0,62}$/.test(slug) ? slug : '';
}

function normalizeHostname(value) {
  const hostname = String(value || '').trim().toLowerCase().replace(/\.$/, '');
  if (hostname.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(hostname)) return '';
  return hostname;
}

function normalizeLocalPart(value) {
  const local = String(value || '').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._+-]{0,63}$/.test(local) ? local : '';
}

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return email.length <= 254 && /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(email) ? email : '';
}

async function readJson(request) {
  try { return await request.json(); } catch { return null; }
}

async function supabaseJson(path, token, env, init = {}) {
  const key = String(env.SUPABASE_PUBLISHABLE_KEY || DEFAULT_PUBLISHABLE_KEY);
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: key,
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
    cache: 'no-store',
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(data?.message || data?.error_description || data?.error || `SUPABASE_${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

async function workspaceIdentity(request, env, slug) {
  const token = bearer(request);
  if (!token) return null;
  try {
    const [user, contextsRaw] = await Promise.all([
      supabaseJson('/auth/v1/user', token, env),
      supabaseJson('/rest/v1/rpc/current_site_activity_contexts', token, env, { method: 'POST', body: '{}' }),
    ]);
    const contexts = Array.isArray(contextsRaw) ? contextsRaw : [];
    const context = contexts.find(item => String(item?.tenant || '').toLowerCase() === slug);
    if (!user?.id || !user?.email || !context?.tenant_id) return null;
    return {
      userId: String(user.id),
      email: String(user.email).toLowerCase(),
      workspaceId: String(context.tenant_id),
      workspaceKey: String(context.workspace_key || `tenant:${context.tenant_id}`),
      workspaceSlug: slug,
      workspaceName: String(context.workspace_name || slug),
      workspaceKind: String(context.workspace_kind || 'organization'),
      authorizationRole: String(context.authorization_role || ''),
      activityRole: String(context.activity_role || ''),
      activityRoleLabel: String(context.activity_role_label || ''),
      canManage: WRITE_ROLES.has(String(context.authorization_role || '')),
    };
  } catch (error) {
    console.error('EKODI Mail workspace identity', error?.message || error);
    return null;
  }
}

async function mailActor(request, env) {
  const token=bearer(request); if(!token)return null;
  try{const [user,raw]=await Promise.all([supabaseJson('/auth/v1/user',token,env),supabaseJson('/rest/v1/rpc/current_site_activity_contexts',token,env,{method:'POST',body:'{}'})]);
    if(!user?.id||!user?.email)return null; const contexts=(Array.isArray(raw)?raw:[]).map(item=>({workspaceId:String(item?.tenant_id||''),workspaceKey:String(item?.workspace_key||''),workspaceSlug:String(item?.tenant||'').toLowerCase(),workspaceName:String(item?.workspace_name||item?.tenant||''),workspaceKind:String(item?.workspace_kind||'organization'),authorizationRole:String(item?.authorization_role||''),activityRole:String(item?.activity_role||''),activityRoleLabel:String(item?.activity_role_label||''),canManage:WRITE_ROLES.has(String(item?.authorization_role||''))})).filter(x=>x.workspaceId&&x.workspaceSlug);
    return{userId:String(user.id),email:String(user.email).toLowerCase(),contexts};}catch(error){console.error('EKODI Mail actor',error?.message||error);return null}
}
function providerForEmail(email,requested=''){const v=String(requested||'').trim().toLowerCase();if(ACCOUNT_PROVIDERS[v])return v;const d=String(email||'').split('@').pop().toLowerCase();if(['gmail.com','googlemail.com'].includes(d))return'gmail';if(['outlook.com','hotmail.com','live.com'].includes(d))return'outlook';if(d==='naver.com')return'naver';if(['daum.net','hanmail.net'].includes(d))return'daum';if(d==='kakao.com')return'kakao';return'generic-imap'}
function publicAccount(r){return{id:Number(r.id),ownerType:r.owner_type,ownerKey:r.owner_key,workspaceSlug:r.workspace_slug||'',provider:r.provider,providerLabel:ACCOUNT_PROVIDERS[r.provider]?.label||r.provider,emailAddress:r.email_address,displayName:r.display_name||r.email_address,connectorMode:r.connector_mode,connectionStatus:r.connection_status,enabled:Boolean(r.enabled),lastSyncAt:r.last_sync_at||null,lastError:r.last_error||'',credentialStored:Boolean(r.credential_ref)}}
async function accountsForActor(db,actor){const personal=await db.prepare(`SELECT * FROM mail_accounts WHERE owner_type='person' AND owner_key=? ORDER BY display_name,email_address`).bind(actor.userId).all();const work=await Promise.all(actor.contexts.map(c=>db.prepare(`SELECT * FROM mail_accounts WHERE owner_type='workspace' AND owner_key=? ORDER BY display_name,email_address`).bind(c.workspaceId).all()));return[...personal.results.map(r=>({...publicAccount(r),ownerLabel:'개인'})),...work.flatMap((x,i)=>x.results.map(r=>({...publicAccount(r),ownerLabel:actor.contexts[i].workspaceName})))]}

async function accountsVisibleForActor(db,actor){const rows=await accountsForActor(db,actor);return Promise.all(rows.map(async a=>{if(a.ownerType==='person')return{...a,permissions:{read:true,send:true,manage:true}};const grant=await db.prepare(`SELECT can_read,can_send,can_manage FROM mail_account_grants WHERE account_id=? AND principal_type='person' AND principal_key=?`).bind(a.id,actor.userId).first();const context=actor.contexts.find(c=>c.workspaceId===a.ownerKey);return{...a,permissions:{read:Boolean(grant?.can_read),send:Boolean(grant?.can_send),manage:Boolean(grant?.can_manage)||Boolean(context?.canManage)}}}))}
async function accountAccess(db, actor, accountId) {
  const id=Number(accountId||0); if(!Number.isInteger(id)||id<1)return null;
  const row=await db.prepare('SELECT * FROM mail_accounts WHERE id=? AND enabled=1').bind(id).first(); if(!row)return null;
  if(row.owner_type==='person'){if(row.owner_key!==actor.userId)return null;return{row,permissions:{read:true,send:true,manage:true}}}
  const context=actor.contexts.find(c=>c.workspaceId===row.owner_key); if(!context)return null;
  const grant=await db.prepare(`SELECT can_read,can_send,can_manage FROM mail_account_grants WHERE account_id=? AND principal_type='person' AND principal_key=?`).bind(id,actor.userId).first();
  return{row,context,permissions:{read:Boolean(grant?.can_read),send:Boolean(grant?.can_send),manage:Boolean(grant?.can_manage)||Boolean(context.canManage)}};
}
async function credentialForAccount(db, accountId){return db.prepare('SELECT * FROM mail_credentials WHERE account_id=?').bind(Number(accountId)).first()}
async function googleAccessForAccount(env, db, account){
  if(!googleMailConfigured(env)||!mailCredentialReady(env))throw Object.assign(new Error('Google Mail OAuth 구성이 아직 준비되지 않았습니다.'),{code:'MAIL_GOOGLE_NOT_CONFIGURED',status:503});
  const row=await credentialForAccount(db,account.id); if(!row)throw Object.assign(new Error('메일 계정 인증이 필요합니다.'),{code:'MAIL_ACCOUNT_NOT_CONNECTED',status:409});
  const credential=await decryptMailCredential(env,row); if(!credential.refreshToken)throw Object.assign(new Error('메일 계정 재연결이 필요합니다.'),{code:'MAIL_REFRESH_TOKEN_MISSING',status:409});
  const token=await refreshGoogleMailToken(env,credential.refreshToken);
  await db.prepare('UPDATE mail_credentials SET last_refreshed_at=?,updated_at=? WHERE account_id=?').bind(new Date().toISOString(),new Date().toISOString(),account.id).run();
  return{accessToken:token.access_token,scopes:row.scopes||'',credentialRow:row};
}
function callbackHtml(message,ok=false){const title=ok?'EKODI Mail 연결 완료':'EKODI Mail 연결 확인 필요';return new Response(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title><body style="font-family:system-ui;padding:32px;max-width:680px;margin:auto"><h1>${title}</h1><p>${String(message).replace(/[<>&]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]))}</p><p><a href="https://mail.ekodi.kr/admin">메일 관리로 돌아가기</a></p></body></html>`,{status:ok?200:400,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-frame-options':'DENY'}})}

async function ensureSchema(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS mail_domains (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id TEXT NOT NULL,
      workspace_slug TEXT NOT NULL,
      hostname TEXT NOT NULL UNIQUE,
      delivery_mode TEXT NOT NULL DEFAULT 'forward_to_external_inbox',
      routing_provider TEXT NOT NULL DEFAULT 'cloudflare-email-routing',
      routing_status TEXT NOT NULL DEFAULT 'pending_dns',
      outbound_provider TEXT NOT NULL DEFAULT 'unconfigured',
      outbound_status TEXT NOT NULL DEFAULT 'not_configured',
      default_destination TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(workspace_id, hostname)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS mail_routes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id TEXT NOT NULL,
      domain_id INTEGER NOT NULL,
      local_part TEXT NOT NULL,
      destination_email TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      send_enabled INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(domain_id, local_part),
      FOREIGN KEY(domain_id) REFERENCES mail_domains(id)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS mail_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT, owner_type TEXT NOT NULL CHECK(owner_type IN ('person','workspace')),
      owner_key TEXT NOT NULL, workspace_slug TEXT NOT NULL DEFAULT '', provider TEXT NOT NULL,
      email_address TEXT NOT NULL, display_name TEXT NOT NULL DEFAULT '', connector_mode TEXT NOT NULL,
      connection_status TEXT NOT NULL DEFAULT 'pending_connection', credential_ref TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1, last_sync_at TEXT, last_error TEXT NOT NULL DEFAULT '',
      created_by_email TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      UNIQUE(owner_type, owner_key, email_address)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS mail_account_grants (
      account_id INTEGER NOT NULL, principal_type TEXT NOT NULL DEFAULT 'person', principal_key TEXT NOT NULL,
      can_read INTEGER NOT NULL DEFAULT 0, can_send INTEGER NOT NULL DEFAULT 0, can_manage INTEGER NOT NULL DEFAULT 0,
      created_by_email TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      PRIMARY KEY(account_id, principal_type, principal_key), FOREIGN KEY(account_id) REFERENCES mail_accounts(id)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS mail_credentials (
      id TEXT PRIMARY KEY, account_id INTEGER NOT NULL UNIQUE, provider TEXT NOT NULL, credential_ciphertext TEXT NOT NULL,
      credential_iv TEXT NOT NULL, scopes TEXT NOT NULL DEFAULT '', token_type TEXT NOT NULL DEFAULT 'Bearer',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_refreshed_at TEXT, FOREIGN KEY(account_id) REFERENCES mail_accounts(id)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS mail_oauth_states (
      nonce_hash TEXT PRIMARY KEY, account_id INTEGER NOT NULL, actor_user_id TEXT NOT NULL, actor_email TEXT NOT NULL,
      capability TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY(account_id) REFERENCES mail_accounts(id)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS mail_account_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT, account_id INTEGER, subject_type TEXT NOT NULL, subject_key TEXT NOT NULL,
      actor_email TEXT NOT NULL, action TEXT NOT NULL, resource TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS mail_control_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id TEXT NOT NULL,
      workspace_slug TEXT NOT NULL,
      actor_email TEXT NOT NULL,
      action TEXT NOT NULL,
      resource TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_mail_domains_workspace ON mail_domains(workspace_id, hostname)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_mail_routes_workspace ON mail_routes(workspace_id, enabled)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_mail_accounts_owner ON mail_accounts(owner_type, owner_key, enabled)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_mail_accounts_email ON mail_accounts(email_address)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_mail_account_grants_principal ON mail_account_grants(principal_type, principal_key)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_mail_credentials_account ON mail_credentials(account_id)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_mail_oauth_states_expiry ON mail_oauth_states(expires_at)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_mail_account_audit_subject ON mail_account_audit(subject_type, subject_key, created_at DESC)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_mail_audit_workspace_time ON mail_control_audit(workspace_id, created_at DESC)'),
  ]);
}

async function auditAccount(db, actor, subjectType, subjectKey, accountId, action, resource, detail=''){await db.prepare(`INSERT INTO mail_account_audit (account_id,subject_type,subject_key,actor_email,action,resource,detail,created_at) VALUES (?,?,?,?,?,?,?,?)`).bind(accountId||null,subjectType,subjectKey,actor.email,action,resource,String(detail).slice(0,1000),new Date().toISOString()).run()}
async function audit(db, identity, action, resource, detail = '') {
  await db.prepare(`INSERT INTO mail_control_audit
    (workspace_id, workspace_slug, actor_email, action, resource, detail, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(identity.workspaceId, identity.workspaceSlug, identity.email, action, resource, String(detail).slice(0, 1000), new Date().toISOString()).run();
}

async function bootstrapEkodiChurch(db, identity) {
  if (identity.workspaceSlug !== 'ekodi-church') return;
  const now = new Date().toISOString();
  await db.prepare(`INSERT INTO mail_domains
    (workspace_id, workspace_slug, hostname, delivery_mode, routing_provider, routing_status,
     outbound_provider, outbound_status, default_destination, created_at, updated_at)
    VALUES (?, ?, 'ekodichurch.kr', 'forward_to_external_inbox', ?, 'pending_dns',
      'unconfigured', 'not_configured', 'ekodichurch@gmail.com', ?, ?)
    ON CONFLICT(workspace_id, hostname) DO UPDATE SET
      routing_provider=CASE WHEN mail_domains.routing_status='pending_dns' THEN excluded.routing_provider ELSE mail_domains.routing_provider END,
      default_destination=CASE WHEN mail_domains.routing_status='pending_dns' THEN excluded.default_destination ELSE mail_domains.default_destination END,
      updated_at=excluded.updated_at`)
    .bind(identity.workspaceId, identity.workspaceSlug, DEFAULT_PROVIDER, now, now).run();
  const domain = await db.prepare('SELECT id FROM mail_domains WHERE workspace_id = ? AND hostname = ?')
    .bind(identity.workspaceId, 'ekodichurch.kr').first();
  if (domain?.id) {
    await db.prepare(`INSERT OR IGNORE INTO mail_routes
      (workspace_id, domain_id, local_part, destination_email, enabled, send_enabled, created_at, updated_at)
      VALUES (?, ?, 'joseph', 'ekodichurch@gmail.com', 1, 0, ?, ?)`)
      .bind(identity.workspaceId, domain.id, now, now).run();
  }
  await db.prepare(`INSERT OR IGNORE INTO mail_accounts (owner_type,owner_key,workspace_slug,provider,email_address,display_name,connector_mode,connection_status,credential_ref,enabled,created_by_email,created_at,updated_at) VALUES ('workspace',?,'ekodi-church','gmail','ekodichurch@gmail.com','에코디교회 Gmail','google-oauth','pending_oauth','',1,?,?,?)`).bind(identity.workspaceId,identity.email,now,now).run();
}

function parseDnsAnswer(data, type) {
  return (data?.Answer || []).filter(row => Number(row.type) === type).map(row => String(row.data || '').replace(/^"|"$/g, ''));
}

async function dnsQuery(hostname, type) {
  const url = new URL('https://dns.google/resolve');
  url.searchParams.set('name', hostname);
  url.searchParams.set('type', type);
  try {
    const response = await fetch(url, { headers: { accept: 'application/dns-json' }, cache: 'no-store' });
    if (!response.ok) return [];
    const data = await response.json();
    const code = type === 'MX' ? 15 : type === 'TXT' ? 16 : type === 'NS' ? 2 : 0;
    return parseDnsAnswer(data, code);
  } catch { return []; }
}

async function dnsSnapshot(hostname, provider = DEFAULT_PROVIDER) {
  const [mx, txt, ns] = await Promise.all([
    dnsQuery(hostname, 'MX'),
    dnsQuery(hostname, 'TXT'),
    dnsQuery(hostname, 'NS'),
  ]);
  const cloudflareMx = mx.some(value => /\broute[123]\.mx\.cloudflare\.net\.?$/i.test(value));
  const cloudflareNs = ns.some(value => /\.ns\.cloudflare\.com\.?$/i.test(value));
  const forwardMx1 = mx.some(value => /\bmx1\.forwardemail\.net\.?$/i.test(value));
  const forwardMx2 = mx.some(value => /\bmx2\.forwardemail\.net\.?$/i.test(value));
  const routingDnsReady = provider === 'forward-email'
    ? forwardMx1 && forwardMx2
    : provider === 'cloudflare-email-routing'
      ? cloudflareMx
      : mx.length > 0;
  return {
    checkedAt: new Date().toISOString(),
    mx,
    txt,
    nameservers: ns,
    hasMx: mx.length > 0,
    provider,
    cloudflareDns: cloudflareNs,
    cloudflareRoutingMx: cloudflareMx,
    forwardEmailRoutingMx: forwardMx1 && forwardMx2,
    routingDnsReady,
  };
}

function forwardEmailDnsPlan(domain, routes) {
  const active = routes.filter(route => Number(route.enabled) === 1);
  const aliasValue = active.map(route => `${route.local_part}:${route.destination_email}`).join(',');
  return {
    provider: 'forward-email',
    destinationVisibleInPublicDns: true,
    records: [
      { type: 'MX', name: '@', priority: 0, value: 'mx1.forwardemail.net' },
      { type: 'MX', name: '@', priority: 0, value: 'mx2.forwardemail.net' },
      ...(aliasValue ? [{ type: 'TXT', name: '@', value: `forward-email=${aliasValue}` }] : []),
      { type: 'TXT', name: '@', value: 'v=spf1 a include:spf.forwardemail.net -all', mergeIfExistingSpf: true },
    ],
  };
}

function dnsPlan(domain, routes) {
  if (domain.routing_provider === 'forward-email') return forwardEmailDnsPlan(domain, routes);
  return { provider: domain.routing_provider, destinationVisibleInPublicDns: false, records: [] };
}

function publicDomain(row) {
  return {
    id: Number(row.id),
    hostname: row.hostname,
    deliveryMode: row.delivery_mode,
    routingProvider: row.routing_provider,
    routingStatus: row.routing_status,
    outboundProvider: row.outbound_provider,
    outboundStatus: row.outbound_status,
    defaultDestination: row.default_destination,
    updatedAt: row.updated_at,
  };
}

function publicRoute(row, hostname) {
  return {
    id: Number(row.id),
    address: `${row.local_part}@${hostname}`,
    localPart: row.local_part,
    destinationEmail: row.destination_email,
    enabled: Boolean(row.enabled),
    sendEnabled: Boolean(row.send_enabled),
    updatedAt: row.updated_at,
  };
}

async function workspaceSnapshot(db, identity) {
  await bootstrapEkodiChurch(db, identity);
  const domainRows = await db.prepare('SELECT * FROM mail_domains WHERE workspace_id = ? ORDER BY hostname')
    .bind(identity.workspaceId).all();
  const routeRows = await db.prepare(`SELECT r.*, d.hostname FROM mail_routes r
    JOIN mail_domains d ON d.id = r.domain_id
    WHERE r.workspace_id = ? ORDER BY d.hostname, r.local_part`).bind(identity.workspaceId).all();
  const domains = domainRows.results.map(publicDomain);
  const dnsPairs = await Promise.all(domains.map(async domain => [domain.hostname, await dnsSnapshot(domain.hostname, domain.routingProvider)]));
  const dnsPlans = Object.fromEntries(domainRows.results.map(domain => [domain.hostname, dnsPlan(domain, routeRows.results.filter(route => Number(route.domain_id) === Number(domain.id)))]));
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    workspace: {
      id: identity.workspaceId,
      key: identity.workspaceKey,
      slug: identity.workspaceSlug,
      name: identity.workspaceName,
      kind: identity.workspaceKind,
      authorizationRole: identity.authorizationRole,
      activityRole: identity.activityRole,
      activityRoleLabel: identity.activityRoleLabel,
      canManage: identity.canManage,
    },
    strategy: {
      hub: 'mail.ekodi.kr',
      inbound: 'custom-domain -> routing provider -> external Gmail inbox',
      outbound: 'independent authenticated SMTP/API provider -> custom-domain From address',
      providerIndependence: true,
    },
    domains,
    routes: routeRows.results.map(row => publicRoute(row, row.hostname)),
    dns: Object.fromEntries(dnsPairs),
    dnsPlans,
  };
}

async function requireWorkspace(request, env, slug) {
  if (!slug) return { response: json({ error: '운영공간을 확인해 주세요.', code: 'WORKSPACE_REQUIRED' }, 400, request) };
  const identity = await workspaceIdentity(request, env, slug);
  if (!identity) return { response: json({ error: '이 운영공간의 메일 관리 권한이 없습니다.', code: 'WORKSPACE_ACCESS_REQUIRED' }, 403, request) };
  return { identity };
}

export async function handleMailControl(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(MAIL_PREFIX)) return null;
  const origin = request.headers.get('origin');
  if (origin && !ALLOWED_ORIGINS.has(origin)) return json({ error: '허용되지 않은 요청입니다.', code: 'ORIGIN_DENIED' }, 403, request);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
  if (!env.DB) return json({ error: '메일 관리 데이터베이스가 연결되지 않았습니다.', code: 'DB_UNAVAILABLE' }, 503, request);
  await ensureSchema(env.DB);

  const googleConnectMatch=url.pathname.match(/^\/api\/mail\/control\/accounts\/(\d+)\/connect\/google$/);
  if(googleConnectMatch&&request.method==='POST'){
    const actor=await mailActor(request,env);if(!actor)return json({error:'로그인이 필요합니다.',code:'AUTH_REQUIRED'},401,request);
    const access=await accountAccess(env.DB,actor,googleConnectMatch[1]);if(!access)return json({error:'메일 계정을 찾을 수 없습니다.',code:'ACCOUNT_NOT_FOUND'},404,request);
    if(!access.permissions.manage)return json({error:'이 메일 계정을 연결할 권한이 없습니다.',code:'MAIL_MANAGE_FORBIDDEN'},403,request);
    if(access.row.provider!=='gmail')return json({error:'이 공급자는 Google OAuth 연결 대상이 아닙니다.',code:'PROVIDER_NOT_GOOGLE'},409,request);
    if(!googleMailConfigured(env)||!mailCredentialReady(env))return json({error:'Google Mail OAuth 비밀설정이 아직 준비되지 않았습니다.',code:'MAIL_GOOGLE_NOT_CONFIGURED'},503,request);
    const body=await readJson(request);const capability=['read','send','read_send'].includes(String(body?.capability||''))?String(body.capability):'read';
    const nonce=crypto.randomUUID();const now=new Date();const expires=new Date(now.getTime()+10*60*1000);
    await env.DB.prepare('DELETE FROM mail_oauth_states WHERE expires_at<=?').bind(now.toISOString()).run();
    await env.DB.prepare('INSERT INTO mail_oauth_states(nonce_hash,account_id,actor_user_id,actor_email,capability,expires_at,created_at) VALUES(?,?,?,?,?,?,?)').bind(await mailNonceHash(nonce),access.row.id,actor.userId,actor.email,capability,expires.toISOString(),now.toISOString()).run();
    const state=await signMailState(env,{nonce,accountId:Number(access.row.id),actorUserId:actor.userId,capability,exp:expires.getTime()});
    const authorizeUrl=googleMailAuthorizeUrl(env,{state,loginHint:access.row.email_address,capability});
    await env.DB.prepare("UPDATE mail_accounts SET connection_status='pending_oauth',last_error='',updated_at=? WHERE id=?").bind(now.toISOString(),access.row.id).run();
    await auditAccount(env.DB,actor,access.row.owner_type,access.row.owner_key,access.row.id,'mail.oauth.start',access.row.email_address,JSON.stringify({provider:'gmail',capability}));
    return json({ok:true,authorizeUrl,capability,verification:{gmailReadonly:'restricted',gmailSend:'sensitive',externalUsersMayRequireGoogleVerification:true}},200,request);
  }
  if(request.method==='GET'&&url.pathname===`${MAIL_PREFIX}/oauth/google/callback`){
    if(!googleMailConfigured(env)||!mailCredentialReady(env))return callbackHtml('Google Mail OAuth 환경설정이 아직 준비되지 않았습니다.');
    const state=await readMailState(env,url.searchParams.get('state'));const code=String(url.searchParams.get('code')||'');
    if(!state||!code||Number(state.exp||0)<Date.now())return callbackHtml('연결 요청이 만료되었거나 올바르지 않습니다.');
    const stateRow=await env.DB.prepare('SELECT * FROM mail_oauth_states WHERE nonce_hash=? AND account_id=? AND actor_user_id=? AND expires_at>?').bind(await mailNonceHash(state.nonce),Number(state.accountId),String(state.actorUserId),new Date().toISOString()).first();
    if(!stateRow)return callbackHtml('이미 사용되었거나 만료된 연결 요청입니다.');
    await env.DB.prepare('DELETE FROM mail_oauth_states WHERE nonce_hash=?').bind(await mailNonceHash(state.nonce)).run();
    const account=await env.DB.prepare('SELECT * FROM mail_accounts WHERE id=? AND enabled=1').bind(Number(state.accountId)).first();
    if(!account||account.provider!=='gmail')return callbackHtml('연결할 Gmail 계정을 찾을 수 없습니다.');
    try{
      const token=await exchangeGoogleMailCode(env,code);const profile=await googleMailProfile(token.access_token);const connectedEmail=String(profile.emailAddress||'').trim().toLowerCase();
      if(connectedEmail!==String(account.email_address).toLowerCase())return callbackHtml(`선택한 Google 계정(${connectedEmail||'확인 불가'})이 등록된 메일 주소와 다릅니다.`);
      const existing=await credentialForAccount(env.DB,account.id);let refreshToken=String(token.refresh_token||'');
      if(!refreshToken&&existing){try{const prior=await decryptMailCredential(env,existing);refreshToken=String(prior.refreshToken||'')}catch{}}
      if(!refreshToken)return callbackHtml('Google에서 장기 연결용 refresh token을 받지 못했습니다. 다시 연결해 주세요.');
      const priorScopes=String(existing?.scopes||'');const scopes=String(token.scope||priorScopes).trim();
      if((stateRow.capability==='read'||stateRow.capability==='read_send')&&!hasGoogleReadScope(scopes))return callbackHtml('Gmail 읽기 권한이 승인되지 않았습니다.');
      if((stateRow.capability==='send'||stateRow.capability==='read_send')&&!hasGoogleSendScope(scopes))return callbackHtml('Gmail 발송 권한이 승인되지 않았습니다.');
      const encrypted=await encryptMailCredential(env,{refreshToken});const credentialId=String(existing?.id||crypto.randomUUID());const now=new Date().toISOString();
      await env.DB.prepare(`INSERT INTO mail_credentials(id,account_id,provider,credential_ciphertext,credential_iv,scopes,token_type,created_at,updated_at,last_refreshed_at) VALUES(?,?,?,?,?,?,?, ?,?,?) ON CONFLICT(account_id) DO UPDATE SET credential_ciphertext=excluded.credential_ciphertext,credential_iv=excluded.credential_iv,scopes=excluded.scopes,token_type=excluded.token_type,updated_at=excluded.updated_at,last_refreshed_at=excluded.last_refreshed_at`).bind(credentialId,account.id,'gmail',encrypted.ciphertext,encrypted.iv,scopes,String(token.token_type||'Bearer'),String(existing?.created_at||now),now,now).run();
      await env.DB.prepare("UPDATE mail_accounts SET connection_status='connected',credential_ref=?,last_sync_at=?,last_error='',updated_at=? WHERE id=?").bind(credentialId,now,now,account.id).run();
      await auditAccount(env.DB,{email:stateRow.actor_email},account.owner_type,account.owner_key,account.id,'mail.oauth.connected',account.email_address,JSON.stringify({provider:'gmail',capability:stateRow.capability,scopes:scopes.split(/\s+/).length}));
      return callbackHtml(`${account.email_address} 계정이 EKODI Mail에 안전하게 연결되었습니다.`,true);
    }catch(error){console.error('EKODI Mail Google callback',error);await env.DB.prepare("UPDATE mail_accounts SET connection_status='error',last_error=?,updated_at=? WHERE id=?").bind(String(error?.code||error?.message||'oauth_error').slice(0,300),new Date().toISOString(),account.id).run();return callbackHtml('Google Mail 계정 연결 중 오류가 발생했습니다.');}
  }
  const accountStatusMatch=url.pathname.match(/^\/api\/mail\/control\/accounts\/(\d+)\/status$/);
  if(accountStatusMatch&&request.method==='GET'){
    const actor=await mailActor(request,env);if(!actor)return json({error:'로그인이 필요합니다.',code:'AUTH_REQUIRED'},401,request);
    const access=await accountAccess(env.DB,actor,accountStatusMatch[1]);if(!access)return json({error:'메일 계정을 찾을 수 없습니다.',code:'ACCOUNT_NOT_FOUND'},404,request);
    const credential=await credentialForAccount(env.DB,access.row.id);const aliases=access.row.owner_type==='workspace'?(await env.DB.prepare(`SELECT r.local_part,d.hostname,r.send_enabled FROM mail_routes r JOIN mail_domains d ON d.id=r.domain_id WHERE r.workspace_id=? AND lower(r.destination_email)=lower(?) AND r.enabled=1 ORDER BY d.hostname,r.local_part`).bind(access.row.owner_key,access.row.email_address).all()).results.map(r=>({address:`${r.local_part}@${r.hostname}`,sendEnabled:Boolean(r.send_enabled)})):[];
    return json({account:{...publicAccount(access.row),permissions:access.permissions,aliases},connector:{configured:access.row.provider==='gmail'?googleMailConfigured(env)&&mailCredentialReady(env):false,credentialStored:Boolean(credential),scopes:String(credential?.scopes||''),readScope:Boolean(credential&&hasGoogleReadScope(credential.scopes)),sendScope:Boolean(credential&&hasGoogleSendScope(credential.scopes)),providerStatus:access.row.provider==='gmail'?'implemented':'adapter_pending'}},200,request);
  }

  const selfGrantMatch=url.pathname.match(/^\/api\/mail\/control\/accounts\/(\d+)\/grants\/self$/);
  if(selfGrantMatch&&request.method==='PUT'){
    const actor=await mailActor(request,env);if(!actor)return json({error:'로그인이 필요합니다.',code:'AUTH_REQUIRED'},401,request);
    const access=await accountAccess(env.DB,actor,selfGrantMatch[1]);if(!access)return json({error:'메일 계정을 찾을 수 없습니다.',code:'ACCOUNT_NOT_FOUND'},404,request);
    if(!access.permissions.manage)return json({error:'메일 권한을 변경할 권한이 없습니다.',code:'MAIL_MANAGE_FORBIDDEN'},403,request);
    if(access.row.owner_type==='person')return json({ok:true,permissions:{read:true,send:true,manage:true}},200,request);
    const body=await readJson(request);const canRead=Boolean(body?.read),canSend=Boolean(body?.send),now=new Date().toISOString();
    await env.DB.prepare(`INSERT INTO mail_account_grants(account_id,principal_type,principal_key,can_read,can_send,can_manage,created_by_email,created_at,updated_at) VALUES(?,'person',?,?,?,1,?,?,?) ON CONFLICT(account_id,principal_type,principal_key) DO UPDATE SET can_read=excluded.can_read,can_send=excluded.can_send,can_manage=1,updated_at=excluded.updated_at`).bind(access.row.id,actor.userId,canRead?1:0,canSend?1:0,actor.email,now,now).run();
    await auditAccount(env.DB,actor,access.row.owner_type,access.row.owner_key,access.row.id,'mail.grant.self',access.row.email_address,JSON.stringify({read:canRead,send:canSend}));
    return json({ok:true,permissions:{read:canRead,send:canSend,manage:true}},200,request);
  }
  const messagesMatch=url.pathname.match(/^\/api\/mail\/control\/accounts\/(\d+)\/messages$/);
  if(messagesMatch&&request.method==='GET'){
    const actor=await mailActor(request,env);if(!actor)return json({error:'로그인이 필요합니다.',code:'AUTH_REQUIRED'},401,request);
    const access=await accountAccess(env.DB,actor,messagesMatch[1]);if(!access)return json({error:'메일 계정을 찾을 수 없습니다.',code:'ACCOUNT_NOT_FOUND'},404,request);
    if(!access.permissions.read)return json({error:'이 계정의 메일을 읽을 권한이 없습니다.',code:'MAIL_READ_FORBIDDEN'},403,request);
    if(access.row.connection_status!=='connected')return json({error:'메일 계정을 먼저 연결해 주세요.',code:'MAIL_ACCOUNT_NOT_CONNECTED'},409,request);
    if(access.row.provider!=='gmail')return json({error:'이 공급자의 실제 읽기 어댑터는 아직 활성화되지 않았습니다.',code:'PROVIDER_ADAPTER_PENDING'},501,request);
    try{const auth=await googleAccessForAccount(env,env.DB,access.row);if(!hasGoogleReadScope(auth.scopes))return json({error:'Gmail 읽기 권한을 추가로 승인해 주세요.',code:'MAIL_READ_SCOPE_REQUIRED'},409,request);const data=await listGoogleMailMessages(auth.accessToken,{q:url.searchParams.get('q')||'',pageToken:url.searchParams.get('pageToken')||'',maxResults:url.searchParams.get('maxResults')||30});const now=new Date().toISOString();await env.DB.prepare("UPDATE mail_accounts SET last_sync_at=?,last_error='',updated_at=? WHERE id=?").bind(now,now,access.row.id).run();return json({account:{id:Number(access.row.id),emailAddress:access.row.email_address,displayName:access.row.display_name,provider:'gmail'},...data},200,request)}catch(error){console.error('EKODI Mail list',error);await env.DB.prepare('UPDATE mail_accounts SET last_error=?,updated_at=? WHERE id=?').bind(String(error?.code||error?.message||'mail_read_error').slice(0,300),new Date().toISOString(),access.row.id).run();return json({error:'메일을 불러오지 못했습니다.',code:String(error?.code||'MAIL_READ_FAILED')},Number(error?.status)||502,request)}
  }

  const messageMatch=url.pathname.match(/^\/api\/mail\/control\/accounts\/(\d+)\/messages\/([A-Za-z0-9_-]+)$/);
  if(messageMatch&&request.method==='GET'){
    const actor=await mailActor(request,env);if(!actor)return json({error:'로그인이 필요합니다.',code:'AUTH_REQUIRED'},401,request);
    const access=await accountAccess(env.DB,actor,messageMatch[1]);if(!access)return json({error:'메일 계정을 찾을 수 없습니다.',code:'ACCOUNT_NOT_FOUND'},404,request);
    if(!access.permissions.read)return json({error:'이 계정의 메일을 읽을 권한이 없습니다.',code:'MAIL_READ_FORBIDDEN'},403,request);
    if(access.row.connection_status!=='connected'||access.row.provider!=='gmail')return json({error:'연결된 Gmail 계정이 아닙니다.',code:'MAIL_ACCOUNT_NOT_CONNECTED'},409,request);
    try{const auth=await googleAccessForAccount(env,env.DB,access.row);if(!hasGoogleReadScope(auth.scopes))return json({error:'Gmail 읽기 권한을 승인해 주세요.',code:'MAIL_READ_SCOPE_REQUIRED'},409,request);const message=await getGoogleMailMessage(auth.accessToken,messageMatch[2]);return json({account:{id:Number(access.row.id),emailAddress:access.row.email_address},message},200,request)}catch(error){console.error('EKODI Mail detail',error);return json({error:'메일 본문을 불러오지 못했습니다.',code:String(error?.code||'MAIL_DETAIL_FAILED')},Number(error?.status)||502,request)}
  }
  const sendMatch=url.pathname.match(/^\/api\/mail\/control\/accounts\/(\d+)\/send$/);
  if(sendMatch&&request.method==='POST'){
    const actor=await mailActor(request,env);if(!actor)return json({error:'로그인이 필요합니다.',code:'AUTH_REQUIRED'},401,request);
    const access=await accountAccess(env.DB,actor,sendMatch[1]);if(!access)return json({error:'메일 계정을 찾을 수 없습니다.',code:'ACCOUNT_NOT_FOUND'},404,request);
    if(!access.permissions.send)return json({error:'이 계정으로 메일을 보낼 권한이 없습니다.',code:'MAIL_SEND_FORBIDDEN'},403,request);
    if(access.row.connection_status!=='connected'||access.row.provider!=='gmail')return json({error:'연결된 Gmail 계정이 아닙니다.',code:'MAIL_ACCOUNT_NOT_CONNECTED'},409,request);
    const body=await readJson(request);const to=String(body?.to||'').trim();const subject=String(body?.subject||'').slice(0,500);const text=String(body?.body||'').slice(0,200000);
    if(!to||/[\r\n]/.test(to))return json({error:'받는 사람 주소를 확인해 주세요.',code:'INVALID_RECIPIENT'},400,request);
    try{const auth=await googleAccessForAccount(env,env.DB,access.row);if(!hasGoogleSendScope(auth.scopes))return json({error:'Gmail 발송 권한을 추가로 승인해 주세요.',code:'MAIL_SEND_SCOPE_REQUIRED'},409,request);const sent=await sendGoogleMailMessage(auth.accessToken,{to,cc:String(body?.cc||''),bcc:String(body?.bcc||''),subject,body:text});await auditAccount(env.DB,actor,access.row.owner_type,access.row.owner_key,access.row.id,'mail.message.send',access.row.email_address,JSON.stringify({messageId:sent.id||'',to:to.slice(0,200),subject:subject.slice(0,120)}));return json({ok:true,id:sent.id||null,threadId:sent.threadId||null},200,request)}catch(error){console.error('EKODI Mail send',error);return json({error:'메일 발송에 실패했습니다.',code:String(error?.code||'MAIL_SEND_FAILED')},Number(error?.status)||502,request)}
  }

  const disconnectMatch=url.pathname.match(/^\/api\/mail\/control\/accounts\/(\d+)\/disconnect$/);
  if(disconnectMatch&&request.method==='POST'){
    const actor=await mailActor(request,env);if(!actor)return json({error:'로그인이 필요합니다.',code:'AUTH_REQUIRED'},401,request);
    const access=await accountAccess(env.DB,actor,disconnectMatch[1]);if(!access)return json({error:'메일 계정을 찾을 수 없습니다.',code:'ACCOUNT_NOT_FOUND'},404,request);
    if(!access.permissions.manage)return json({error:'이 메일 계정을 해제할 권한이 없습니다.',code:'MAIL_MANAGE_FORBIDDEN'},403,request);
    await env.DB.prepare('DELETE FROM mail_credentials WHERE account_id=?').bind(access.row.id).run();const now=new Date().toISOString();
    await env.DB.prepare("UPDATE mail_accounts SET connection_status=?,credential_ref='',last_sync_at=NULL,last_error='',updated_at=? WHERE id=?").bind(access.row.provider==='gmail'?'pending_oauth':'pending_connection',now,access.row.id).run();
    await auditAccount(env.DB,actor,access.row.owner_type,access.row.owner_key,access.row.id,'mail.account.disconnect',access.row.email_address,'');
    return json({ok:true},200,request);
  }
  if(request.method==='GET'&&url.pathname===`${MAIL_PREFIX}/contexts`){const actor=await mailActor(request,env);if(!actor)return json({error:'로그인이 필요합니다.',code:'AUTH_REQUIRED'},401,request);for(const c of actor.contexts)await bootstrapEkodiChurch(env.DB,{...c,userId:actor.userId,email:actor.email,workspaceName:c.workspaceName,workspaceKind:c.workspaceKind});return json({person:{id:actor.userId,email:actor.email,canManage:true},workspaces:actor.contexts,providers:ACCOUNT_PROVIDERS,accounts:await accountsVisibleForActor(env.DB,actor),authorityModel:'mail-admin-projects-existing-person-and-workspace-authority'},200,request)}
  if(request.method==='GET'&&url.pathname===`${MAIL_PREFIX}/accounts`){const actor=await mailActor(request,env);if(!actor)return json({error:'로그인이 필요합니다.',code:'AUTH_REQUIRED'},401,request);return json({accounts:await accountsVisibleForActor(env.DB,actor),providers:ACCOUNT_PROVIDERS},200,request)}
  if(request.method==='POST'&&url.pathname===`${MAIL_PREFIX}/accounts`){
    const body=await readJson(request),actor=await mailActor(request,env);
    if(!actor)return json({error:'로그인이 필요합니다.',code:'AUTH_REQUIRED'},401,request);
    const email=normalizeEmail(body?.emailAddress),scope=String(body?.scope||'person').trim().toLowerCase(),provider=providerForEmail(email,body?.provider);
    if(!email||!ACCOUNT_PROVIDERS[provider])return json({error:'연결할 메일 계정을 확인해 주세요.',code:'INVALID_ACCOUNT'},400,request);
    let ownerType='person',ownerKey=actor.userId,workspaceSlug='';
    if(scope==='workspace'){const slug=normalizeSlug(body?.workspace),context=actor.contexts.find(x=>x.workspaceSlug===slug);if(!context)return json({error:'이 운영공간에 접근할 수 없습니다.',code:'WORKSPACE_ACCESS_REQUIRED'},403,request);if(!context.canManage)return json({error:'이 운영공간의 메일 계정을 변경할 권한이 없습니다.',code:'WRITE_FORBIDDEN'},403,request);ownerType='workspace';ownerKey=context.workspaceId;workspaceSlug=context.workspaceSlug}
    const config=ACCOUNT_PROVIDERS[provider],status=config.auth==='service-account'?'pending_service_connection':config.auth==='oauth'?'pending_oauth':'pending_connection',displayName=String(body?.displayName||email).trim().slice(0,100),now=new Date().toISOString();
    await env.DB.prepare(`INSERT INTO mail_accounts (owner_type,owner_key,workspace_slug,provider,email_address,display_name,connector_mode,connection_status,credential_ref,enabled,created_by_email,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,'',1,?,?,?) ON CONFLICT(owner_type,owner_key,email_address) DO UPDATE SET provider=excluded.provider,display_name=excluded.display_name,connector_mode=excluded.connector_mode,enabled=1,updated_at=excluded.updated_at`).bind(ownerType,ownerKey,workspaceSlug,provider,email,displayName,config.connectorMode,status,actor.email,now,now).run();
    const account=await env.DB.prepare('SELECT id FROM mail_accounts WHERE owner_type=? AND owner_key=? AND email_address=?').bind(ownerType,ownerKey,email).first();
    if(account?.id){const canRead=ownerType==='person'?1:(body?.grantSelfRead?1:0),canSend=ownerType==='person'?1:(body?.grantSelfSend?1:0);await env.DB.prepare(`INSERT INTO mail_account_grants (account_id,principal_type,principal_key,can_read,can_send,can_manage,created_by_email,created_at,updated_at) VALUES (?,'person',?,?,?,?,?,?,?) ON CONFLICT(account_id,principal_type,principal_key) DO UPDATE SET can_read=excluded.can_read,can_send=excluded.can_send,can_manage=excluded.can_manage,updated_at=excluded.updated_at`).bind(account.id,actor.userId,canRead,canSend,1,actor.email,now,now).run();await auditAccount(env.DB,actor,ownerType,ownerKey,account.id,'mail.account.register',email,JSON.stringify({provider,connectorMode:config.connectorMode,grantSelfRead:Boolean(canRead),grantSelfSend:Boolean(canSend)}))}
    return json({ok:true,accounts:await accountsVisibleForActor(env.DB,actor)},200,request);
  }

  if (request.method === 'GET' && url.pathname === `${MAIL_PREFIX}/workspace`) {
    const slug = normalizeSlug(url.searchParams.get('slug'));
    const access = await requireWorkspace(request, env, slug);
    if (access.response) return access.response;
    return json(await workspaceSnapshot(env.DB, access.identity), 200, request);
  }

  if (request.method === 'POST' && url.pathname === `${MAIL_PREFIX}/domains`) {
    const body = await readJson(request);
    const slug = normalizeSlug(body?.workspace);
    const hostname = normalizeHostname(body?.hostname);
    const destination = normalizeEmail(body?.defaultDestination);
    const access = await requireWorkspace(request, env, slug);
    if (access.response) return access.response;
    if (!access.identity.canManage) return json({ error: '메일 도메인을 변경할 권한이 없습니다.', code: 'WRITE_FORBIDDEN' }, 403, request);
    if (!hostname || !destination) return json({ error: '도메인과 전달 받을 이메일을 확인해 주세요.', code: 'INVALID_DOMAIN' }, 400, request);
    const now = new Date().toISOString();
    await env.DB.prepare(`INSERT INTO mail_domains
      (workspace_id, workspace_slug, hostname, delivery_mode, routing_provider, routing_status,
       outbound_provider, outbound_status, default_destination, created_at, updated_at)
      VALUES (?, ?, ?, 'forward_to_external_inbox', ?, 'pending_dns', 'unconfigured', 'not_configured', ?, ?, ?)
      ON CONFLICT(workspace_id, hostname) DO UPDATE SET default_destination=excluded.default_destination, updated_at=excluded.updated_at`)
      .bind(access.identity.workspaceId, slug, hostname, DEFAULT_PROVIDER, destination, now, now).run();
    await audit(env.DB, access.identity, 'mail.domain.upsert', hostname, JSON.stringify({ destination }));
    return json(await workspaceSnapshot(env.DB, access.identity), 200, request);
  }

  if (request.method === 'POST' && url.pathname === `${MAIL_PREFIX}/routes`) {
    const body = await readJson(request);
    const slug = normalizeSlug(body?.workspace);
    const localPart = normalizeLocalPart(body?.localPart);
    const destination = normalizeEmail(body?.destinationEmail);
    const domainId = Number(body?.domainId || 0);
    const access = await requireWorkspace(request, env, slug);
    if (access.response) return access.response;
    if (!access.identity.canManage) return json({ error: '메일 주소를 변경할 권한이 없습니다.', code: 'WRITE_FORBIDDEN' }, 403, request);
    if (!Number.isInteger(domainId) || domainId < 1 || !localPart || !destination) return json({ error: '메일 주소와 전달 받을 이메일을 확인해 주세요.', code: 'INVALID_ROUTE' }, 400, request);
    const domain = await env.DB.prepare('SELECT id, hostname FROM mail_domains WHERE id = ? AND workspace_id = ?')
      .bind(domainId, access.identity.workspaceId).first();
    if (!domain) return json({ error: '이 운영공간의 메일 도메인이 아닙니다.', code: 'DOMAIN_NOT_FOUND' }, 404, request);
    const now = new Date().toISOString();
    await env.DB.prepare(`INSERT INTO mail_routes
      (workspace_id, domain_id, local_part, destination_email, enabled, send_enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, 0, ?, ?)
      ON CONFLICT(domain_id, local_part) DO UPDATE SET destination_email=excluded.destination_email, enabled=1, updated_at=excluded.updated_at`)
      .bind(access.identity.workspaceId, domainId, localPart, destination, now, now).run();
    await audit(env.DB, access.identity, 'mail.route.upsert', `${localPart}@${domain.hostname}`, JSON.stringify({ destination }));
    return json(await workspaceSnapshot(env.DB, access.identity), 200, request);
  }

  const routeMatch = url.pathname.match(/^\/api\/mail\/control\/routes\/(\d+)$/);
  if (routeMatch && request.method === 'PUT') {
    const body = await readJson(request);
    const slug = normalizeSlug(body?.workspace);
    const destination = body?.destinationEmail == null ? null : normalizeEmail(body.destinationEmail);
    const enabled = body?.enabled == null ? null : Boolean(body.enabled);
    const access = await requireWorkspace(request, env, slug);
    if (access.response) return access.response;
    if (!access.identity.canManage) return json({ error: '메일 주소를 변경할 권한이 없습니다.', code: 'WRITE_FORBIDDEN' }, 403, request);
    const id = Number(routeMatch[1]);
    const route = await env.DB.prepare(`SELECT r.*, d.hostname FROM mail_routes r JOIN mail_domains d ON d.id=r.domain_id
      WHERE r.id=? AND r.workspace_id=?`).bind(id, access.identity.workspaceId).first();
    if (!route) return json({ error: '메일 주소를 찾을 수 없습니다.', code: 'ROUTE_NOT_FOUND' }, 404, request);
    const nextDestination = destination || route.destination_email;
    const nextEnabled = enabled == null ? Boolean(route.enabled) : enabled;
    await env.DB.prepare('UPDATE mail_routes SET destination_email=?, enabled=?, updated_at=? WHERE id=? AND workspace_id=?')
      .bind(nextDestination, nextEnabled ? 1 : 0, new Date().toISOString(), id, access.identity.workspaceId).run();
    await audit(env.DB, access.identity, 'mail.route.update', `${route.local_part}@${route.hostname}`, JSON.stringify({ destination: nextDestination, enabled: nextEnabled }));
    return json(await workspaceSnapshot(env.DB, access.identity), 200, request);
  }

  if (request.method === 'POST' && url.pathname === `${MAIL_PREFIX}/verify`) {
    const body = await readJson(request);
    const slug = normalizeSlug(body?.workspace);
    const domainId = Number(body?.domainId || 0);
    const access = await requireWorkspace(request, env, slug);
    if (access.response) return access.response;
    if (!access.identity.canManage) return json({ error: '메일 도메인을 확인할 권한이 없습니다.', code: 'WRITE_FORBIDDEN' }, 403, request);
    const domain = await env.DB.prepare('SELECT * FROM mail_domains WHERE id=? AND workspace_id=?').bind(domainId, access.identity.workspaceId).first();
    if (!domain) return json({ error: '메일 도메인을 찾을 수 없습니다.', code: 'DOMAIN_NOT_FOUND' }, 404, request);
    const dns = await dnsSnapshot(domain.hostname, domain.routing_provider);
    const routingStatus = dns.routingDnsReady ? 'dns_ready' : (dns.hasMx ? 'foreign_mx' : 'pending_dns');
    await env.DB.prepare('UPDATE mail_domains SET routing_status=?, updated_at=? WHERE id=? AND workspace_id=?')
      .bind(routingStatus, new Date().toISOString(), domainId, access.identity.workspaceId).run();
    await audit(env.DB, access.identity, 'mail.domain.verify', domain.hostname, JSON.stringify({ routingStatus, nameservers: dns.nameservers, mx: dns.mx }));
    return json(await workspaceSnapshot(env.DB, access.identity), 200, request);
  }

  return json({ error: '메일 관리 API를 찾을 수 없습니다.', code: 'NOT_FOUND' }, 404, request);
}
