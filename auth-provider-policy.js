const PROVIDERS = Object.freeze([
  { id: 'google', name: 'Google', configuredByDefault: true },
  { id: 'microsoft', name: 'Microsoft', configuredByDefault: false },
  { id: 'kakao', name: 'Kakao', configuredByDefault: false },
  { id: 'naver', name: 'Naver', configuredByDefault: false },
  { id: 'apple', name: 'Apple', configuredByDefault: false }
]);

const PROVIDER_IDS = new Set(PROVIDERS.map(provider => provider.id));

async function corsHeaders(request, env, ctx, core) {
  try {
    const probe = new Request(request.url, { method: 'OPTIONS', headers: request.headers });
    const response = await core.fetch(probe, env, ctx);
    return response.headers;
  } catch {
    return new Headers();
  }
}

async function json(request, env, ctx, core, data, status = 200) {
  const headers = new Headers(await corsHeaders(request, env, ctx, core));
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  headers.set('x-content-type-options', 'nosniff');
  return new Response(JSON.stringify(data), { status, headers });
}

async function ensureSchema(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS auth_login_policy (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      multi_login_enabled INTEGER NOT NULL DEFAULT 0,
      default_provider TEXT NOT NULL DEFAULT 'google',
      updated_at TEXT NOT NULL,
      updated_by INTEGER
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS auth_login_providers (
      provider_id TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 0,
      configured INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      updated_by INTEGER
    )`)
  ]);
  const now = new Date().toISOString();
  await db.prepare(`INSERT OR IGNORE INTO auth_login_policy
    (id, multi_login_enabled, default_provider, updated_at)
    VALUES (1, 0, 'google', ?)`).bind(now).run();
  const seed = db.prepare(`INSERT OR IGNORE INTO auth_login_providers
    (provider_id, enabled, configured, updated_at)
    VALUES (?, ?, ?, ?)`);
  await db.batch(PROVIDERS.map(provider => seed.bind(
    provider.id,
    provider.id === 'google' ? 1 : 0,
    provider.configuredByDefault ? 1 : 0,
    now
  )));
}

async function currentSession(request, env, ctx, core) {
  const url = new URL(request.url);
  url.pathname = '/api/session';
  url.search = '';
  const sessionRequest = new Request(url.toString(), {
    method: 'GET',
    headers: request.headers
  });
  const response = await core.fetch(sessionRequest, env, ctx);
  if (!response.ok) return null;
  try { return await response.json(); } catch { return null; }
}

async function policySnapshot(db) {
  await ensureSchema(db);
  const [policy, rows] = await Promise.all([
    db.prepare('SELECT * FROM auth_login_policy WHERE id = 1').first(),
    db.prepare('SELECT * FROM auth_login_providers ORDER BY provider_id').all()
  ]);
  const byId = new Map((rows.results || []).map(row => [row.provider_id, row]));
  const providers = PROVIDERS.map(provider => {
    const row = byId.get(provider.id);
    return {
      id: provider.id,
      name: provider.name,
      enabled: Boolean(row?.enabled),
      configured: Boolean(row?.configured),
      status: row?.configured ? (row?.enabled ? 'active' : 'available') : 'setup_required'
    };
  });
  const enabledProviders = providers.filter(provider => provider.enabled && provider.configured).map(provider => provider.id);
  const defaultProvider = enabledProviders.includes(policy?.default_provider) ? policy.default_provider : 'google';
  return {
    multiLoginEnabled: Boolean(policy?.multi_login_enabled) && enabledProviders.length > 1,
    multiLoginRequested: Boolean(policy?.multi_login_enabled),
    defaultProvider,
    enabledProviders,
    providers,
    updatedAt: policy?.updated_at || ''
  };
}

async function actorId(db, email) {
  if (!email) return null;
  const row = await db.prepare('SELECT id FROM admins WHERE email = ?').bind(String(email).toLowerCase()).first();
  return row?.id || null;
}

async function writeAudit(db, adminId, detail) {
  await db.prepare(`INSERT INTO audit_logs (admin_id, action, resource, detail, created_at)
    VALUES (?, 'auth.providers.update', 'identity', ?, ?)`)
    .bind(adminId, String(detail).slice(0, 500), new Date().toISOString()).run();
}

async function updatePolicy(request, env, ctx, core, session) {
  let body;
  try { body = await request.json(); } catch { body = null; }
  if (!body || typeof body !== 'object') {
    return json(request, env, ctx, core, { error: '로그인 설정 형식을 확인해 주세요.' }, 400);
  }
  await ensureSchema(env.DB);
  const rows = await env.DB.prepare('SELECT provider_id, configured FROM auth_login_providers').all();
  const configured = new Set((rows.results || []).filter(row => Boolean(row.configured)).map(row => row.provider_id));
  const requested = body.providers && typeof body.providers === 'object' ? body.providers : {};
  const enabled = new Set();
  for (const provider of PROVIDERS) {
    const wantsEnabled = requested[provider.id] === true;
    if (wantsEnabled && !configured.has(provider.id)) {
      return json(request, env, ctx, core, { error: `${provider.name} 로그인은 아직 연동 설정이 완료되지 않았습니다.`, code: 'PROVIDER_NOT_CONFIGURED', provider: provider.id }, 409);
    }
    if (wantsEnabled) enabled.add(provider.id);
  }
  if (!enabled.size) {
    return json(request, env, ctx, core, { error: '최소 하나의 로그인 방식을 활성화해야 합니다.' }, 400);
  }
  const defaultProvider = String(body.defaultProvider || '').trim().toLowerCase();
  if (!PROVIDER_IDS.has(defaultProvider) || !enabled.has(defaultProvider)) {
    return json(request, env, ctx, core, { error: '기본 로그인 방식은 활성화된 제공자 중에서 선택해야 합니다.' }, 400);
  }
  const multiLoginEnabled = Boolean(body.multiLoginEnabled);
  const adminId = await actorId(env.DB, session.email);
  const now = new Date().toISOString();
  await env.DB.prepare(`UPDATE auth_login_policy
    SET multi_login_enabled = ?, default_provider = ?, updated_at = ?, updated_by = ?
    WHERE id = 1`)
    .bind(multiLoginEnabled ? 1 : 0, defaultProvider, now, adminId).run();
  const updateProvider = env.DB.prepare(`UPDATE auth_login_providers
    SET enabled = ?, updated_at = ?, updated_by = ? WHERE provider_id = ?`);
  await env.DB.batch(PROVIDERS.map(provider => updateProvider.bind(enabled.has(provider.id) ? 1 : 0, now, adminId, provider.id)));
  await writeAudit(env.DB, adminId, JSON.stringify({ multiLoginEnabled, defaultProvider, enabledProviders: [...enabled] }));
  return json(request, env, ctx, core, { ok: true, policy: await policySnapshot(env.DB) });
}

export async function handleAuthProviderPolicy(request, env, ctx, core) {
  const url = new URL(request.url);
  if (request.method === 'OPTIONS') return null;
  if (!env.DB) return null;

  if (request.method === 'GET' && url.pathname === '/api/auth/providers') {
    const snapshot = await policySnapshot(env.DB);
    return json(request, env, ctx, core, {
      multiLoginEnabled: snapshot.multiLoginEnabled,
      defaultProvider: snapshot.defaultProvider,
      enabledProviders: snapshot.enabledProviders,
      providers: snapshot.providers.map(({ id, name, enabled, configured, status }) => ({ id, name, enabled, configured, status }))
    });
  }

  if (url.pathname !== '/api/admin/auth/providers') return null;
  const session = await currentSession(request, env, ctx, core);
  if (!session?.authenticated) {
    return json(request, env, ctx, core, { error: '관리자 인증이 필요합니다.' }, 401);
  }
  if (session.role !== 'super_admin') {
    return json(request, env, ctx, core, { error: '최고관리자 권한이 필요합니다.' }, 403);
  }
  if (request.method === 'GET') {
    return json(request, env, ctx, core, { policy: await policySnapshot(env.DB) });
  }
  if (request.method === 'PUT') {
    return updatePolicy(request, env, ctx, core, session);
  }
  return json(request, env, ctx, core, { error: '지원하지 않는 요청입니다.' }, 405);
}
