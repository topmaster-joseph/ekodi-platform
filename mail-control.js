const SUPABASE_URL = 'https://renzehysxirjilvdxacv.supabase.co';
const DEFAULT_PUBLISHABLE_KEY = 'sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const MAIL_PREFIX = '/api/mail/control';
const WRITE_ROLES = new Set(['tenant_admin', 'owner', 'admin', 'manager', 'store_owner']);
const ALLOWED_ORIGINS = new Set(['https://ekodi.kr', 'https://mail.ekodi.kr', 'https://my.ekodi.kr']);
const DEFAULT_PROVIDER = 'cloudflare-email-routing';

function cors(origin) {
  const headers = {
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
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
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
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
    db.prepare('CREATE INDEX IF NOT EXISTS idx_mail_audit_workspace_time ON mail_control_audit(workspace_id, created_at DESC)'),
  ]);
}

async function audit(db, identity, action, resource, detail = '') {
  await db.prepare(`INSERT INTO mail_control_audit
    (workspace_id, workspace_slug, actor_email, action, resource, detail, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(identity.workspaceId, identity.workspaceSlug, identity.email, action, resource, String(detail).slice(0, 1000), new Date().toISOString()).run();
}

async function bootstrapEkodiChurch(db, identity) {
  if (identity.workspaceSlug !== 'ekodi-church') return;
  const now = new Date().toISOString();
  await db.prepare(`INSERT OR IGNORE INTO mail_domains
    (workspace_id, workspace_slug, hostname, delivery_mode, routing_provider, routing_status,
     outbound_provider, outbound_status, default_destination, created_at, updated_at)
    VALUES (?, ?, 'ekodichurch.kr', 'forward_to_external_inbox', ?, 'pending_dns',
      'unconfigured', 'not_configured', 'ekodichurch@gmail.com', ?, ?)`)
    .bind(identity.workspaceId, identity.workspaceSlug, DEFAULT_PROVIDER, now, now).run();
  const domain = await db.prepare('SELECT id FROM mail_domains WHERE workspace_id = ? AND hostname = ?')
    .bind(identity.workspaceId, 'ekodichurch.kr').first();
  if (domain?.id) {
    await db.prepare(`INSERT OR IGNORE INTO mail_routes
      (workspace_id, domain_id, local_part, destination_email, enabled, send_enabled, created_at, updated_at)
      VALUES (?, ?, 'joseph', 'ekodichurch@gmail.com', 1, 0, ?, ?)`)
      .bind(identity.workspaceId, domain.id, now, now).run();
  }
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

async function dnsSnapshot(hostname) {
  const [mx, txt, ns] = await Promise.all([
    dnsQuery(hostname, 'MX'),
    dnsQuery(hostname, 'TXT'),
    dnsQuery(hostname, 'NS'),
  ]);
  const cloudflareMx = mx.some(value => /\broute[123]\.mx\.cloudflare\.net\.?$/i.test(value));
  const cloudflareNs = ns.some(value => /\.ns\.cloudflare\.com\.?$/i.test(value));
  return {
    checkedAt: new Date().toISOString(),
    mx,
    txt,
    nameservers: ns,
    hasMx: mx.length > 0,
    cloudflareDns: cloudflareNs,
    cloudflareRoutingMx: cloudflareMx,
    routingDnsReady: cloudflareMx,
  };
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
  const dnsPairs = await Promise.all(domains.map(async domain => [domain.hostname, await dnsSnapshot(domain.hostname)]));
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
    const dns = await dnsSnapshot(domain.hostname);
    const routingStatus = dns.cloudflareRoutingMx ? 'dns_ready' : (dns.hasMx ? 'foreign_mx' : 'pending_dns');
    await env.DB.prepare('UPDATE mail_domains SET routing_status=?, updated_at=? WHERE id=? AND workspace_id=?')
      .bind(routingStatus, new Date().toISOString(), domainId, access.identity.workspaceId).run();
    await audit(env.DB, access.identity, 'mail.domain.verify', domain.hostname, JSON.stringify({ routingStatus, nameservers: dns.nameservers, mx: dns.mx }));
    return json(await workspaceSnapshot(env.DB, access.identity), 200, request);
  }

  return json({ error: '메일 관리 API를 찾을 수 없습니다.', code: 'NOT_FOUND' }, 404, request);
}
