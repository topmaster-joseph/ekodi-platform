import authWorker from './auth-worker.js';
import apiWorker from './api-worker.js';
import { buildCoreAiGateway, getCoreAiGatewayStatus } from './core-ai-gateway.js';
import { createOpenAiProvider, getOpenAiProviderStatus } from './openai-provider-adapter.js';
import { createCloudflareWorkersAiProvider, getCloudflareWorkersAiProviderStatus } from './workers-ai-provider-adapter.js';
import { AI_MISSION_RUNTIME, evaluateMissionAction, getRuntimeAgentPolicy } from './ai-governance-runtime.js';

const PREFIX = '/api/control/ai';
const MAX_LIST = 100;
const MAX_PAYLOAD_BYTES = 16_384;
const MAX_ASSIST_MESSAGE_CHARS = 4_000;
const MAX_ASSIST_HISTORY_ITEMS = 8;
const SAFE_EXECUTORS = new Set(['service.health_check']);

function aiProviderChain(env = {}) {
  const workersAi = createCloudflareWorkersAiProvider(env);
  const openai = createOpenAiProvider(env);
  const primary = String(env.AI_PROVIDER_PRIMARY || 'cloudflare-workers-ai').trim().toLowerCase();
  return primary === 'openai' ? [openai, workersAi] : [workersAi, openai];
}

function aiProviderStatuses(env = {}) {
  const workersAi = getCloudflareWorkersAiProviderStatus(env);
  const openai = getOpenAiProviderStatus(env);
  const primary = String(env.AI_PROVIDER_PRIMARY || 'cloudflare-workers-ai').trim().toLowerCase();
  return primary === 'openai' ? [openai, workersAi] : [workersAi, openai];
}

function json(data, status = 200, request = null, env = {}) {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  const origin = request?.headers?.get('origin');
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
  if (origin && allowed.includes(origin)) {
    headers.set('access-control-allow-origin', origin);
    headers.set('vary', 'Origin');
  }
  return new Response(JSON.stringify(data), { status, headers });
}

async function sessionCheck(request, env) {
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
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS ai_agent_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      agent_name TEXT NOT NULL,
      action_type TEXT NOT NULL,
      area TEXT NOT NULL,
      target TEXT NOT NULL DEFAULT '',
      rationale TEXT NOT NULL DEFAULT '',
      payload_json TEXT NOT NULL DEFAULT '{}',
      decision_tier TEXT NOT NULL,
      decision_reason TEXT NOT NULL,
      status TEXT NOT NULL,
      requested_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      decided_by TEXT,
      decided_at TEXT,
      decision_note TEXT NOT NULL DEFAULT '',
      result_json TEXT NOT NULL DEFAULT '{}',
      verified_at TEXT
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_ai_agent_actions_created ON ai_agent_actions(created_at DESC)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_ai_agent_actions_status ON ai_agent_actions(status, created_at DESC)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_ai_agent_actions_agent ON ai_agent_actions(agent_id, created_at DESC)'),
  ]);
}

async function readJson(request) {
  try { return await request.json(); } catch { return null; }
}

function normalizeAction(body = {}) {
  const actionType = String(body.actionType || '').trim().slice(0, 100);
  const area = String(body.area || '').trim().slice(0, 120);
  return {
    agentId: String(body.agentId || '').trim().slice(0, 80),
    actionType,
    area,
    target: String(body.target || '').trim().slice(0, 240),
    rationale: String(body.rationale || '').trim().slice(0, 1000),
    payload: body.payload && typeof body.payload === 'object' && !Array.isArray(body.payload) ? body.payload : {},
    reversible: Boolean(body.reversible),
    delegated: Boolean(body.delegated),
    logged: true,
    preflightVerified: Boolean(body.preflightVerified),
    reducesUserRights: Boolean(body.reducesUserRights),
    crossTenantPrivateData: Boolean(body.crossTenantPrivateData),
    violates: Array.isArray(body.violates) ? body.violates.map(value => String(value).slice(0, 120)).slice(0, 20) : [],
  };
}

function normalizeAssistPage(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    section: String(source.section || '').trim().slice(0, 120),
    title: String(source.title || '').trim().slice(0, 180),
    pathname: String(source.pathname || '').trim().slice(0, 240),
    hash: String(source.hash || '').trim().slice(0, 180),
  };
}

function normalizeAssistHistory(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(-MAX_ASSIST_HISTORY_ITEMS).map(item => ({
    role: item?.role === 'assistant' ? 'assistant' : item?.role === 'user' ? 'user' : '',
    text: String(item?.text ?? item?.content ?? '').trim().slice(0, 2_000),
  })).filter(item => item.role && item.text);
}

function payloadJson(action) {
  try {
    const value = JSON.stringify(action.payload || {});
    return { value, bytes: new TextEncoder().encode(value).byteLength };
  } catch {
    return { value: '{}', bytes: Number.POSITIVE_INFINITY };
  }
}

function payloadError(action) {
  const payload = payloadJson(action);
  if (!Number.isFinite(payload.bytes)) return { error: 'payload는 JSON으로 직렬화할 수 있어야 합니다.', code: 'INVALID_ACTION_PAYLOAD' };
  if (payload.bytes > MAX_PAYLOAD_BYTES) return { error: `AI action payload는 ${MAX_PAYLOAD_BYTES}바이트 이하여야 합니다.`, code: 'ACTION_PAYLOAD_TOO_LARGE' };
  return null;
}

function initialStatus(result, action) {
  if (result.tier === 'forbidden') return 'blocked';
  if (result.tier === 'human_gate') return 'awaiting_human';
  if (result.tier === 'observe' && SAFE_EXECUTORS.has(action.actionType)) return 'executing';
  if (result.tier === 'execute_reversible' && SAFE_EXECUTORS.has(action.actionType)) return 'executing';
  if (result.tier === 'execute_reversible') return 'ready_for_executor';
  return 'assist_only';
}

async function insertAction(env, session, action, result) {
  const now = new Date().toISOString();
  const agent = getRuntimeAgentPolicy(action.agentId);
  const status = initialStatus(result, action);
  const row = await env.DB.prepare(`INSERT INTO ai_agent_actions
    (agent_id, agent_name, action_type, area, target, rationale, payload_json, decision_tier, decision_reason, status, requested_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING id`)
    .bind(
      action.agentId,
      agent?.name || 'Unknown Agent',
      action.actionType,
      action.area,
      action.target,
      action.rationale,
      payloadJson(action).value,
      result.tier,
      result.reason,
      status,
      String(session.email || 'unknown'),
      now,
    ).first();
  return { id: row?.id, status, now };
}

async function executeSafeAction(request, env, action) {
  if (action.actionType !== 'service.health_check') {
    return { ok: false, code: 'NO_EXECUTOR', detail: 'No autonomous executor is registered for this action type.' };
  }
  if (action.area !== 'health_checks') {
    return { ok: false, code: 'EXECUTOR_AREA_MISMATCH', detail: 'service.health_check is restricted to the health_checks observation area.' };
  }
  const url = new URL(request.url);
  url.pathname = '/api/control/check';
  url.search = '';
  const response = await apiWorker.fetch(new Request(url.toString(), {
    method: 'POST',
    headers: request.headers,
  }), env, {});
  let data = null;
  try { data = await response.clone().json(); } catch {}
  return { ok: response.ok, status: response.status, data };
}

async function finalizeAction(env, id, execution) {
  const now = new Date().toISOString();
  const status = execution.ok ? 'verified' : 'failed';
  await env.DB.prepare(`UPDATE ai_agent_actions
    SET status = ?, result_json = ?, verified_at = ?
    WHERE id = ?`)
    .bind(status, JSON.stringify(execution), now, id).run();
  return { status, verifiedAt: now };
}

async function finalizeAssistAction(env, id, result, value) {
  const now = new Date().toISOString();
  const status = result.ok ? 'verified' : 'failed';
  const audit = {
    mode: result.mode,
    degraded: Boolean(result.degraded),
    provider: result.provider || null,
    model: value?.model || null,
    responseId: value?.responseId || null,
    notice: result.notice || '',
  };
  await env.DB.prepare(`UPDATE ai_agent_actions
    SET status = ?, result_json = ?, verified_at = ?
    WHERE id = ?`)
    .bind(status, JSON.stringify(audit), now, id).run();
  return { status, verifiedAt: now };
}

async function listActions(env, url) {
  const requested = Number.parseInt(url.searchParams.get('limit') || '30', 10);
  const limit = Math.min(Math.max(Number.isFinite(requested) ? requested : 30, 1), MAX_LIST);
  const status = String(url.searchParams.get('status') || '').trim().slice(0, 80);
  const agentId = String(url.searchParams.get('agentId') || '').trim().slice(0, 80);
  const clauses = [];
  const values = [];
  if (status) { clauses.push('status = ?'); values.push(status); }
  if (agentId) { clauses.push('agent_id = ?'); values.push(agentId); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = await env.DB.prepare(`SELECT id, agent_id, agent_name, action_type, area, target, rationale,
      decision_tier, decision_reason, status, requested_by, created_at, decided_by, decided_at,
      decision_note, result_json, verified_at
    FROM ai_agent_actions ${where}
    ORDER BY id DESC LIMIT ?`)
    .bind(...values, limit).all();
  return (rows.results || []).map(row => ({
    ...row,
    result: safeParse(row.result_json),
    result_json: undefined,
  }));
}

function safeParse(value) {
  try { return JSON.parse(value || '{}'); } catch { return {}; }
}

async function handleAdminAssist(request, env, session) {
  const body = await readJson(request);
  if (!body) return json({ error: '유효한 JSON 요청이 필요합니다.', code: 'INVALID_JSON' }, 400, request, env);
  const message = String(body.message || '').trim().slice(0, MAX_ASSIST_MESSAGE_CHARS);
  if (!message) return json({ error: 'AI Assist 요청 내용이 필요합니다.', code: 'ASSIST_MESSAGE_REQUIRED' }, 400, request, env);
  const page = normalizeAssistPage(body.context || body.page || {});
  const history = normalizeAssistHistory(body.history);

  const auditAction = normalizeAction({
    agentId: 'chief',
    actionType: 'admin.assist_chat',
    area: 'read_only_audits',
    target: page.section || 'admin',
    rationale: message,
    payload: {
      source: 'admin-assist-dock',
      context: page,
      historyItems: history.length,
    },
    reversible: true,
    delegated: true,
    preflightVerified: true,
  });
  const decision = evaluateMissionAction(auditAction);
  const stored = await insertAction(env, session, auditAction, decision);
  const providers = aiProviderChain(env);
  const gateway = buildCoreAiGateway(env, providers);
  const configuredTimeout = Number(env.AI_ADMIN_TIMEOUT_MS || 15_000);
  const timeoutMs = Math.min(Math.max(Number.isFinite(configuredTimeout) ? configuredTimeout : 15_000, 2_500), 30_000);
  const result = await gateway.run({
    taskName: 'admin-assist',
    timeoutMs,
    context: {
      message,
      page,
      history,
      requestedBy: String(session.email || 'unknown'),
    },
    fallback: () => ({
      text: '외부 AI 연결이 준비되지 않았거나 일시적으로 응답하지 않습니다. 요청은 감사 가능한 운영 기록에 남겼으며, EKODI의 핵심 관리 기능은 AI 없이도 계속 사용할 수 있습니다.',
      model: null,
      responseId: null,
    }),
  });
  const value = result.value && typeof result.value === 'object' ? result.value : { text: String(result.value || '') };
  const finalized = await finalizeAssistAction(env, stored.id, result, value);
  if (!result.ok) {
    return json({
      ok: false,
      actionId: stored.id,
      status: finalized.status,
      mode: result.mode,
      degraded: true,
      provider: null,
      reply: 'AI 보조 기능 없이 핵심 기능을 계속 이용할 수 있습니다.',
      notice: result.notice || '',
    }, 503, request, env);
  }
  return json({
    ok: true,
    actionId: stored.id,
    status: finalized.status,
    mode: result.mode,
    degraded: Boolean(result.degraded),
    provider: result.provider || null,
    model: value.model || null,
    reply: String(value.text || '').trim(),
    notice: result.notice || '',
  }, 200, request, env);
}

async function decideAction(request, env, session, id) {
  const body = await readJson(request);
  const decision = String(body?.decision || '').trim().toLowerCase();
  if (!['approve', 'reject'].includes(decision)) return json({ error: 'decision은 approve 또는 reject여야 합니다.', code: 'INVALID_DECISION' }, 400, request, env);

  const row = await env.DB.prepare('SELECT id, decision_tier, status FROM ai_agent_actions WHERE id = ?').bind(id).first();
  if (!row) return json({ error: 'AI action을 찾을 수 없습니다.', code: 'ACTION_NOT_FOUND' }, 404, request, env);
  if (row.decision_tier !== 'human_gate' || row.status !== 'awaiting_human') {
    return json({ error: '사람의 결정 대기 상태인 action만 결정할 수 있습니다.', code: 'ACTION_NOT_AWAITING_HUMAN' }, 409, request, env);
  }

  const now = new Date().toISOString();
  const nextStatus = decision === 'approve' ? 'approved_pending_executor' : 'rejected';
  const note = String(body?.note || '').trim().slice(0, 1000);
  await env.DB.prepare(`UPDATE ai_agent_actions
    SET status = ?, decided_by = ?, decided_at = ?, decision_note = ?
    WHERE id = ?`)
    .bind(nextStatus, String(session.email || 'unknown'), now, note, id).run();

  return json({ ok: true, id, status: nextStatus, decidedAt: now, note }, 200, request, env);
}

export async function handleAgentMissionControl(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(PREFIX)) return null;

  if (request.method === 'OPTIONS') {
    const headers = new Headers({
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'authorization,content-type',
      'access-control-max-age': '86400',
    });
    const origin = request.headers.get('origin');
    const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
    if (origin && allowed.includes(origin)) { headers.set('access-control-allow-origin', origin); headers.set('vary', 'Origin'); }
    return new Response(null, { status: 204, headers });
  }

  const auth = await sessionCheck(request, env);
  if (!auth.session?.authenticated) return auth.response;
  if (!env.DB) return json({ error: 'AI mission control DB가 연결되지 않았습니다.', code: 'AI_DB_NOT_CONFIGURED' }, 503, request, env);
  await ensureSchema(env.DB);

  if (request.method === 'GET' && url.pathname === `${PREFIX}/governance`) {
    return json({
      ok: true,
      policyVersion: AI_MISSION_RUNTIME.version,
      authorityModel: AI_MISSION_RUNTIME.authorityModel,
      policyPriority: AI_MISSION_RUNTIME.policyPriority,
      agents: Object.entries(AI_MISSION_RUNTIME.agents).map(([id, agent]) => ({ id, name: agent.name, mustEscalate: agent.mustEscalate || [], mustNot: agent.mustNot || [] })),
      actionTiers: ['observe', 'assist', 'execute_reversible', 'human_gate', 'forbidden'],
      humanGateAreas: AI_MISSION_RUNTIME.humanGateAreas,
      forbiddenAreas: AI_MISSION_RUNTIME.forbiddenAreas,
    }, 200, request, env);
  }

  if (request.method === 'GET' && url.pathname === `${PREFIX}/provider-status`) {
    const providers = aiProviderChain(env);
    const statuses = aiProviderStatuses(env);
    return json({
      ok: true,
      gateway: getCoreAiGatewayStatus(env, providers),
      providers: statuses,
      openai: statuses.find(item => item.id === 'openai') || getOpenAiProviderStatus(env),
      workersAi: statuses.find(item => item.id === 'cloudflare-workers-ai') || getCloudflareWorkersAiProviderStatus(env),
    }, 200, request, env);
  }

  if (request.method === 'POST' && url.pathname === `${PREFIX}/assist`) {
    return handleAdminAssist(request, env, auth.session);
  }

  if (request.method === 'POST' && url.pathname === `${PREFIX}/evaluate`) {
    const body = await readJson(request);
    if (!body) return json({ error: '유효한 JSON 요청이 필요합니다.', code: 'INVALID_JSON' }, 400, request, env);
    const action = normalizeAction(body);
    const payloadIssue = payloadError(action);
    if (payloadIssue) return json(payloadIssue, payloadIssue.code === 'ACTION_PAYLOAD_TOO_LARGE' ? 413 : 400, request, env);
    return json({ ok: true, action, decision: evaluateMissionAction(action) }, 200, request, env);
  }

  if (request.method === 'GET' && url.pathname === `${PREFIX}/actions`) {
    return json({ ok: true, actions: await listActions(env, url) }, 200, request, env);
  }

  if (request.method === 'POST' && url.pathname === `${PREFIX}/actions`) {
    const body = await readJson(request);
    if (!body) return json({ error: '유효한 JSON 요청이 필요합니다.', code: 'INVALID_JSON' }, 400, request, env);
    const action = normalizeAction(body);
    if (!action.agentId || !action.actionType || !action.area) {
      return json({ error: 'agentId, actionType, area는 필수입니다.', code: 'ACTION_FIELDS_REQUIRED' }, 400, request, env);
    }
    const payloadIssue = payloadError(action);
    if (payloadIssue) return json(payloadIssue, payloadIssue.code === 'ACTION_PAYLOAD_TOO_LARGE' ? 413 : 400, request, env);
    const decision = evaluateMissionAction(action);
    const stored = await insertAction(env, auth.session, action, decision);

    if (stored.status === 'executing') {
      const execution = await executeSafeAction(request, env, action);
      const finalized = await finalizeAction(env, stored.id, execution);
      return json({ ok: execution.ok, id: stored.id, decision, status: finalized.status, execution }, execution.ok ? 200 : 502, request, env);
    }

    return json({ ok: true, id: stored.id, decision, status: stored.status }, decision.tier === 'forbidden' ? 403 : 202, request, env);
  }

  const decisionMatch = url.pathname.match(/^\/api\/control\/ai\/actions\/(\d+)\/decision$/);
  if (request.method === 'POST' && decisionMatch) {
    return decideAction(request, env, auth.session, Number(decisionMatch[1]));
  }

  return json({ error: 'AI Mission Control 경로를 찾을 수 없습니다.', code: 'AI_CONTROL_NOT_FOUND' }, 404, request, env);
}
