const SUPABASE_URL = 'https://renzehysxirjilvdxacv.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const ACCESS_API = `${SUPABASE_URL}/functions/v1/access-api`;

const PLAN_POLICY = Object.freeze({
  free: {
    label: 'FREE', connectedChannels: 0, directPublish: false, scheduledPublish: false,
    recurringAutomation: false, alwaysOnAutomation: false, performanceAnalysis: false,
    metered: false, freeMonthly: { caption: 1, post: 1, shorts: 1 },
  },
  flex: {
    label: 'FLEX', connectedChannels: 1, directPublish: true, scheduledPublish: false,
    recurringAutomation: false, alwaysOnAutomation: false, performanceAnalysis: false,
    metered: true, freeMonthly: null,
  },
  plus: {
    label: 'PLUS', connectedChannels: 3, directPublish: true, scheduledPublish: true,
    recurringAutomation: false, alwaysOnAutomation: false, performanceAnalysis: false,
    metered: true, freeMonthly: null,
  },
  pro: {
    label: 'PRO', connectedChannels: 5, directPublish: true, scheduledPublish: true,
    recurringAutomation: true, alwaysOnAutomation: false, performanceAnalysis: true,
    metered: true, freeMonthly: null,
  },
  auto: {
    label: 'AUTO', connectedChannels: 10, directPublish: true, scheduledPublish: true,
    recurringAutomation: true, alwaysOnAutomation: true, performanceAnalysis: true,
    metered: true, freeMonthly: null,
  },
});

const LEGACY_PLAN_MAP = Object.freeze({ standard: 'free', basic: 'flex', enterprise: 'auto' });
const FEATURES = new Set(['caption', 'post', 'shorts']);
const PROVIDERS = new Set(['instagram','youtube','youtube_shorts','naver_blog','naver_place','naver_cafe','kakao_channel','facebook','tiktok','linkedin']);
const MODES = new Set(['once','scheduled','recurring','always_on']);
const METER_UNITS = Object.freeze({ caption: 500, post: 500, shorts: 1500, publish: 300, scheduled_publish: 500, analysis: 2000 });

function normalizePlan(value) {
  const key = String(value || '').trim().toLowerCase();
  if (PLAN_POLICY[key]) return key;
  return LEGACY_PLAN_MAP[key] || 'free';
}
function bearerToken(request) {
  const value = String(request.headers.get('authorization') || '');
  if (!value.toLowerCase().startsWith('bearer ')) return '';
  const token = value.slice(7).trim();
  return token && token.length <= 8192 ? token : '';
}
function configuredOrigins(env = {}) {
  return new Set(String(env.ALLOWED_ORIGINS || '').split(',').map(v => v.trim()).filter(Boolean));
}
function allowedOrigin(request, env) {
  const origin = String(request.headers.get('origin') || '');
  if (!origin) return true;
  if (configuredOrigins(env).has(origin)) return true;
  try {
    const url = new URL(origin);
    return url.protocol === 'https:' && /^[a-z0-9-]+\.ai\.ekodi\.kr$/i.test(url.hostname);
  } catch { return false; }
}
function headers(request, env) {
  const origin = String(request.headers.get('origin') || '');
  const out = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'access-control-allow-headers': 'authorization, content-type, x-ekodi-provider-secret',
    'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
    'vary': 'Origin',
  };
  if (origin && allowedOrigin(request, env)) out['access-control-allow-origin'] = origin;
  return out;
}
function json(request, env, data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: headers(request, env) });
}
function noContent(request, env, status = 204) {
  const h = headers(request, env); delete h['content-type'];
  return new Response(null, { status, headers: h });
}
async function readJson(request) { try { return await request.json(); } catch { return null; } }
function clip(value, max = 240) { return String(value ?? '').trim().slice(0, max); }
function monthKey(now = new Date()) { return now.toISOString().slice(0, 7); }
function nowIso() { return new Date().toISOString(); }

async function supabaseUser(token) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, authorization: `Bearer ${token}` },
  });
  if (!response.ok) return null;
  const user = await response.json();
  if (!user?.id || !user?.email || !user?.email_confirmed_at) return null;
  return { id: String(user.id), email: String(user.email).toLowerCase() };
}
async function marketingWorkspaces(token) {
  const response = await fetch(`${ACCESS_API}/workspaces?site=marketing`, {
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, authorization: `Bearer ${token}` },
  });
  if (!response.ok) return [];
  const data = await response.json();
  return Array.isArray(data?.workspaces) ? data.workspaces : [];
}
function subjectFor(workspace, user) {
  if (workspace?.store_id) return { type: 'store', key: String(workspace.store_id) };
  if (workspace?.tenant) return { type: 'tenant', key: String(workspace.tenant) };
  return { type: 'person', key: user.id };
}
async function subscriptionPlan(env, workspace, user) {
  const base = normalizePlan(workspace?.plan);
  if (!env.DB) return base;
  const subject = subjectFor(workspace, user);
  try {
    const row = await env.DB.prepare(`SELECT plan_id,status,current_period_end,cancel_at_period_end
      FROM service_subscriptions WHERE subject_type=? AND subject_key=? AND site='marketing' LIMIT 1`)
      .bind(subject.type, subject.key).first();
    if (!row) return base;
    const status = String(row.status || '');
    if (!['active','free'].includes(status)) return base;
    return normalizePlan(row.plan_id || base);
  } catch (error) {
    console.warn('Marketing plan subscription lookup fallback', error?.message || error);
    return base;
  }
}
async function authContext(request, env, requestedKey = '') {
  const token = bearerToken(request);
  if (!token) return { error: 'LOGIN_REQUIRED', status: 401 };
  const [user, workspaces] = await Promise.all([supabaseUser(token), marketingWorkspaces(token)]);
  if (!user) return { error: 'LOGIN_REQUIRED', status: 401 };
  const key = clip(requestedKey, 256);
  const workspace = key
    ? workspaces.find(row => String(row?.workspace_key || '') === key)
    : workspaces.find(row => String(row?.workspace_key || '').startsWith('personal:')) || workspaces[0];
  if (!workspace || !['active','pre_registered','free'].includes(String(workspace.status || ''))) {
    return { error: 'WORKSPACE_REQUIRED', status: 403 };
  }
  const plan = await subscriptionPlan(env, workspace, user);
  return { token, user, workspace, plan, policy: PLAN_POLICY[plan] };
}

async function usageRow(env, workspaceKey, key = monthKey()) {
  let row = await env.DB.prepare(`SELECT workspace_key,month_key,caption_used,post_used,shorts_used
    FROM marketing_usage_monthly WHERE workspace_key=? AND month_key=?`).bind(workspaceKey, key).first();
  if (!row) {
    const now = nowIso();
    await env.DB.prepare(`INSERT OR IGNORE INTO marketing_usage_monthly
      (workspace_key,month_key,caption_used,post_used,shorts_used,updated_at) VALUES (?, ?, 0, 0, 0, ?)`)
      .bind(workspaceKey, key, now).run();
    row = await env.DB.prepare(`SELECT workspace_key,month_key,caption_used,post_used,shorts_used
      FROM marketing_usage_monthly WHERE workspace_key=? AND month_key=?`).bind(workspaceKey, key).first();
  }
  return row || { workspace_key: workspaceKey, month_key: key, caption_used: 0, post_used: 0, shorts_used: 0 };
}
function publicUsage(row, policy) {
  const used = {
    caption: Number(row?.caption_used || 0), post: Number(row?.post_used || 0), shorts: Number(row?.shorts_used || 0),
  };
  const limits = policy.freeMonthly;
  const remaining = limits ? Object.fromEntries(Object.keys(used).map(k => [k, Math.max(0, Number(limits[k] || 0) - used[k])])) : null;
  return { month: row?.month_key || monthKey(), used, limits, remaining };
}
async function channelRows(env, workspaceKey) {
  const result = await env.DB.prepare(`SELECT id,provider,label,status,external_account_id,requested_at,connected_at,updated_at
    FROM marketing_channel_connections WHERE workspace_key=? AND status<>'revoked' ORDER BY id`).bind(workspaceKey).all();
  return result?.results || [];
}
async function automationRows(env, workspaceKey) {
  const result = await env.DB.prepare(`SELECT id,mode,status,channel_connection_id,next_run_at,interval_minutes,created_at,updated_at,last_run_at
    FROM marketing_automation_jobs WHERE workspace_key=? ORDER BY id DESC LIMIT 50`).bind(workspaceKey).all();
  return result?.results || [];
}
async function analytics(env, workspaceKey, allowed) {
  if (!allowed) return null;
  const row = await env.DB.prepare(`SELECT COUNT(*) AS runs,
      SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed,
      SUM(CASE WHEN status='provider_failed' THEN 1 ELSE 0 END) AS failed,
      SUM(CASE WHEN status='provider_pending' THEN 1 ELSE 0 END) AS pending,
      COALESCE(SUM(metered_amount),0) AS metered_amount
    FROM marketing_action_runs WHERE workspace_key=?`).bind(workspaceKey).first();
  return {
    runs: Number(row?.runs || 0), completed: Number(row?.completed || 0), failed: Number(row?.failed || 0),
    pending: Number(row?.pending || 0), meteredAmount: Number(row?.metered_amount || 0),
  };
}
async function runtimeSnapshot(request, env, ctx) {
  const key = String(ctx.workspace.workspace_key || '');
  const [usage, channels, automations, analysis] = await Promise.all([
    usageRow(env, key), channelRows(env, key), automationRows(env, key), analytics(env, key, ctx.policy.performanceAnalysis),
  ]);
  return {
    authenticated: true,
    workspace: {
      workspaceKey: key, workspaceKind: ctx.workspace.workspace_kind || null, workspaceName: ctx.workspace.workspace_name || null,
      tenant: ctx.workspace.tenant || null, storeId: ctx.workspace.store_id || null, storeName: ctx.workspace.store_name || null,
    },
    plan: ctx.plan,
    policy: { ...ctx.policy, freeMonthly: ctx.policy.freeMonthly ? { ...ctx.policy.freeMonthly } : null },
    usage: publicUsage(usage, ctx.policy),
    channels: { connected: channels.filter(row => row.status === 'connected').length, slots: ctx.policy.connectedChannels, items: channels },
    automations,
    analytics: analysis,
    providerExecution: 'connector-callback-required',
  };
}

async function consumeFeature(request, env, ctx) {
  const body = await readJson(request);
  const feature = clip(body?.feature, 32);
  if (!FEATURES.has(feature)) return json(request, env, { error: 'INVALID_FEATURE' }, 400);
  const key = String(ctx.workspace.workspace_key || '');
  const month = monthKey();
  await usageRow(env, key, month);
  if (ctx.plan === 'free') {
    const column = `${feature}_used`;
    const limit = Number(ctx.policy.freeMonthly?.[feature] || 0);
    const result = await env.DB.prepare(`UPDATE marketing_usage_monthly SET ${column}=${column}+1,updated_at=?
      WHERE workspace_key=? AND month_key=? AND ${column}<?`).bind(nowIso(), key, month, limit).run();
    if (Number(result?.meta?.changes || 0) !== 1) {
      const row = await usageRow(env, key, month);
      return json(request, env, { error: 'FREE_MONTHLY_LIMIT', plan: ctx.plan, usage: publicUsage(row, ctx.policy) }, 429);
    }
  } else {
    await env.DB.prepare(`UPDATE marketing_usage_monthly SET ${feature}_used=${feature}_used+1,updated_at=?
      WHERE workspace_key=? AND month_key=?`).bind(nowIso(), key, month).run();
  }
  const amount = ctx.policy.metered ? Number(METER_UNITS[feature] || 0) : 0;
  await env.DB.prepare(`INSERT INTO marketing_action_runs
    (workspace_key,plan_id,action_type,mode,status,metered_amount,detail_json,created_at,updated_at)
    VALUES (?, ?, ?, 'interactive', 'completed', ?, '{}', ?, ?)`)
    .bind(key, ctx.plan, feature, amount, nowIso(), nowIso()).run();
  const row = await usageRow(env, key, month);
  return json(request, env, { ok: true, plan: ctx.plan, metered: ctx.policy.metered, unitAmount: amount, usage: publicUsage(row, ctx.policy) });
}

async function requestChannel(request, env, ctx) {
  if (ctx.policy.connectedChannels <= 0) return json(request, env, { error: 'CHANNEL_PLAN_REQUIRED', plan: ctx.plan }, 403);
  const body = await readJson(request);
  const provider = clip(body?.provider, 40).toLowerCase();
  const label = clip(body?.label, 120) || provider;
  if (!PROVIDERS.has(provider)) return json(request, env, { error: 'UNSUPPORTED_PROVIDER' }, 400);
  const key = String(ctx.workspace.workspace_key || '');
  const rows = await channelRows(env, key);
  if (rows.some(row => row.provider === provider && ['pending_oauth','connected'].includes(String(row.status)))) {
    return json(request, env, { error: 'CHANNEL_ALREADY_EXISTS' }, 409);
  }
  if (rows.filter(row => ['pending_oauth','connected'].includes(String(row.status))).length >= ctx.policy.connectedChannels) {
    return json(request, env, { error: 'CHANNEL_LIMIT', slots: ctx.policy.connectedChannels }, 409);
  }
  const now = nowIso();
  await env.DB.prepare(`INSERT INTO marketing_channel_connections
    (workspace_key,provider,label,status,requested_at,updated_at) VALUES (?, ?, ?, 'pending_oauth', ?, ?)`)
    .bind(key, provider, label, now, now).run();
  const latest = await channelRows(env, key);
  return json(request, env, {
    ok: true, status: 'pending_oauth', provider, channels: latest,
    next: 'provider_oauth', message: '공식 플랫폼 OAuth 연결을 완료하면 채널이 활성화됩니다.',
  }, 201);
}
function providerSecretOk(request, env) {
  const expected = String(env.MARKETING_PROVIDER_CALLBACK_SECRET || '');
  const actual = String(request.headers.get('x-ekodi-provider-secret') || '');
  return Boolean(expected && actual && expected === actual);
}
async function confirmChannel(request, env) {
  if (!providerSecretOk(request, env)) return json(request, env, { error: 'PROVIDER_CALLBACK_REQUIRED' }, 403);
  const body = await readJson(request);
  const id = Number(body?.connectionId || 0);
  const external = clip(body?.externalAccountId, 240);
  if (!id || !external) return json(request, env, { error: 'INVALID_CHANNEL_CALLBACK' }, 400);
  const now = nowIso();
  await env.DB.prepare(`UPDATE marketing_channel_connections SET status='connected',external_account_id=?,connected_at=?,updated_at=? WHERE id=?`)
    .bind(external, now, now, id).run();
  return json(request, env, { ok: true });
}
async function disconnectChannel(request, env, ctx) {
  const body = await readJson(request);
  const id = Number(body?.connectionId || 0);
  if (!id) return json(request, env, { error: 'INVALID_CHANNEL' }, 400);
  const key = String(ctx.workspace.workspace_key || '');
  await env.DB.prepare(`UPDATE marketing_channel_connections SET status='revoked',updated_at=? WHERE id=? AND workspace_key=?`)
    .bind(nowIso(), id, key).run();
  return json(request, env, { ok: true });
}

function modeAllowed(policy, mode) {
  if (mode === 'once') return policy.directPublish;
  if (mode === 'scheduled') return policy.scheduledPublish;
  if (mode === 'recurring') return policy.recurringAutomation;
  if (mode === 'always_on') return policy.alwaysOnAutomation;
  return false;
}
async function createAutomation(request, env, ctx) {
  const body = await readJson(request);
  const mode = clip(body?.mode, 32).toLowerCase();
  if (!MODES.has(mode) || !modeAllowed(ctx.policy, mode)) return json(request, env, { error: 'AUTOMATION_PLAN_REQUIRED', plan: ctx.plan, mode }, 403);
  const channelId = Number(body?.channelConnectionId || 0);
  const key = String(ctx.workspace.workspace_key || '');
  const channel = channelId ? await env.DB.prepare(`SELECT id,status FROM marketing_channel_connections WHERE id=? AND workspace_key=?`).bind(channelId, key).first() : null;
  if (!channel || channel.status !== 'connected') return json(request, env, { error: 'CONNECTED_CHANNEL_REQUIRED' }, 409);
  const payload = body?.payload && typeof body.payload === 'object' ? body.payload : {};
  const interval = mode === 'recurring' || mode === 'always_on' ? Math.max(60, Math.min(43200, Number(body?.intervalMinutes || 1440))) : null;
  let next = nowIso();
  if (mode === 'scheduled') {
    const date = new Date(body?.scheduledFor || '');
    if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now()) return json(request, env, { error: 'FUTURE_SCHEDULE_REQUIRED' }, 400);
    next = date.toISOString();
  }
  const now = nowIso();
  const result = await env.DB.prepare(`INSERT INTO marketing_automation_jobs
    (workspace_key,plan_id,mode,status,channel_connection_id,payload_json,next_run_at,interval_minutes,created_at,updated_at)
    VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?, ?)`)
    .bind(key, ctx.plan, mode, channelId, JSON.stringify(payload), next, interval, now, now).run();
  return json(request, env, { ok: true, jobId: Number(result?.meta?.last_row_id || 0), mode, nextRunAt: next }, 201);
}
async function runtimeAnalytics(request, env, ctx) {
  if (!ctx.policy.performanceAnalysis) return json(request, env, { error: 'ANALYSIS_PLAN_REQUIRED', plan: ctx.plan }, 403);
  return json(request, env, { ok: true, analytics: await analytics(env, String(ctx.workspace.workspace_key || ''), true) });
}
async function completeProviderRun(request, env) {
  if (!providerSecretOk(request, env)) return json(request, env, { error: 'PROVIDER_CALLBACK_REQUIRED' }, 403);
  const body = await readJson(request);
  const id = Number(body?.runId || 0);
  const success = body?.success === true;
  if (!id) return json(request, env, { error: 'INVALID_RUN' }, 400);
  const detail = JSON.stringify(body?.metrics && typeof body.metrics === 'object' ? body.metrics : {});
  await env.DB.prepare(`UPDATE marketing_action_runs SET status=?,detail_json=?,updated_at=? WHERE id=?`)
    .bind(success ? 'completed' : 'provider_failed', detail, nowIso(), id).run();
  return json(request, env, { ok: true, runId: id, status: success ? 'completed' : 'provider_failed' });
}

export async function handleMarketingPlanRuntimeRequest(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/marketing/runtime')) return null;
  if (!allowedOrigin(request, env)) return json(request, env, { error: 'ORIGIN_DENIED' }, 403);
  if (request.method === 'OPTIONS') return noContent(request, env);

  if (url.pathname === '/api/marketing/runtime/channels/confirm' && request.method === 'POST') return confirmChannel(request, env);
  if (url.pathname === '/api/marketing/runtime/runs/complete' && request.method === 'POST') return completeProviderRun(request, env);

  const body = request.method === 'GET' ? null : await request.clone().json().catch(() => null);
  const requestedKey = clip(url.searchParams.get('workspace') || body?.workspaceKey, 256);
  const ctx = await authContext(request, env, requestedKey);
  if (ctx.error) return json(request, env, { error: ctx.error }, ctx.status);

  if (url.pathname === '/api/marketing/runtime' && request.method === 'GET') return json(request, env, await runtimeSnapshot(request, env, ctx));
  if (url.pathname === '/api/marketing/runtime/consume' && request.method === 'POST') return consumeFeature(request, env, ctx);
  if (url.pathname === '/api/marketing/runtime/channels' && request.method === 'POST') return requestChannel(request, env, ctx);
  if (url.pathname === '/api/marketing/runtime/channels' && request.method === 'DELETE') return disconnectChannel(request, env, ctx);
  if (url.pathname === '/api/marketing/runtime/automations' && request.method === 'POST') return createAutomation(request, env, ctx);
  if (url.pathname === '/api/marketing/runtime/analytics' && request.method === 'GET') return runtimeAnalytics(request, env, ctx);
  return json(request, env, { error: 'MARKETING_RUNTIME_ENDPOINT_NOT_FOUND' }, 404);
}

function nextRecurring(job) {
  const minutes = Math.max(60, Number(job.interval_minutes || 1440));
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}
export async function runMarketingPlanRuntimeSchedule(env) {
  if (!env.DB) return;
  const now = nowIso();
  const due = await env.DB.prepare(`SELECT id,workspace_key,plan_id,mode,channel_connection_id,payload_json,interval_minutes
    FROM marketing_automation_jobs WHERE status='active' AND next_run_at IS NOT NULL AND next_run_at<=? ORDER BY next_run_at LIMIT 50`).bind(now).all();
  for (const job of due?.results || []) {
    const channel = await env.DB.prepare(`SELECT id,status,provider,external_account_id FROM marketing_channel_connections WHERE id=? AND workspace_key=?`)
      .bind(job.channel_connection_id, job.workspace_key).first();
    const stamp = nowIso();
    if (!channel || channel.status !== 'connected') {
      await env.DB.prepare(`UPDATE marketing_automation_jobs SET status='waiting_connector',updated_at=? WHERE id=?`).bind(stamp, job.id).run();
      continue;
    }
    const amount = job.mode === 'scheduled' ? METER_UNITS.scheduled_publish : METER_UNITS.publish;
    const run = await env.DB.prepare(`INSERT INTO marketing_action_runs
      (workspace_key,plan_id,action_type,mode,status,channel_connection_id,metered_amount,detail_json,created_at,updated_at)
      VALUES (?, ?, 'publish', ?, 'provider_pending', ?, ?, ?, ?, ?)`)
      .bind(job.workspace_key, normalizePlan(job.plan_id), job.mode, job.channel_connection_id, amount,
        JSON.stringify({ provider: channel.provider, payload: JSON.parse(job.payload_json || '{}') }), stamp, stamp).run();
    const runId = Number(run?.meta?.last_row_id || 0);
    const recurring = job.mode === 'recurring' || job.mode === 'always_on';
    await env.DB.prepare(`UPDATE marketing_automation_jobs SET status=?,last_run_at=?,next_run_at=?,updated_at=? WHERE id=?`)
      .bind(recurring ? 'active' : 'waiting_provider', stamp, recurring ? nextRecurring(job) : null, stamp, job.id).run();
    console.log('Marketing provider execution pending', { runId, provider: channel.provider, workspace: job.workspace_key });
  }
}

export { PLAN_POLICY, normalizePlan, modeAllowed };
