import authWorker from './auth-worker.js';
import { getCoreAiGatewayStatus } from './core-ai-gateway.js';
import {
  getEkodiCommandLedgerStatus,
  getEkodiCommandTask,
  ingestEkodiPulse,
  listEkodiCommandTasks,
} from './ekodi-command-ledger.js';
import { getEkodiProviderOperationalReadiness, runEkodiCommandQueue } from './ekodi-pulse-runtime.js';

const PREFIX = '/api/control/ai/v8';

function text(value, max = 1200) {
  return String(value ?? '').trim().slice(0, max);
}

function json(request, env, data, status = 200) {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  const origin = String(request.headers.get('origin') || '').trim();
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
  const response = await authWorker.fetch(new Request(url.toString(), { method: 'GET', headers: request.headers }), env);
  if (!response.ok) return { response };
  const session = await response.clone().json().catch(() => null);
  return { response, session };
}

async function readJson(request) {
  try { return await request.json(); } catch { return null; }
}

function pulseInput(body = {}, session = {}) {
  const source = body.event && typeof body.event === 'object' ? body.event : body;
  const summary = text(source.summary || source.message || body.goal, 1000);
  return {
    taskId: text(body.taskId, 120) || undefined,
    goal: text(body.goal || summary, 1200),
    risk: text(body.risk || 'normal', 20).toLowerCase(),
    target: body.target && typeof body.target === 'object' ? body.target : {},
    delegation: body.delegation && typeof body.delegation === 'object' ? body.delegation : {},
    context: {
      ...(body.context && typeof body.context === 'object' ? body.context : {}),
      requestedBy: text(session.email || 'admin', 200),
      source: 'admin-ai-command-center',
    },
    maxAttempts: body.maxAttempts,
    event: {
      id: text(source.id || source.eventId, 120) || undefined,
      kind: text(source.kind || source.type || 'manual_goal', 60).toLowerCase(),
      source: text(source.source || 'admin-ai-command-center', 120),
      summary,
      changeClass: text(source.changeClass || 'green', 80).toLowerCase(),
      actionable: source.actionable !== false,
      requiresHumanDecision: source.requiresHumanDecision === true,
    },
  };
}

export async function handleEkodiV8CommandControl(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(PREFIX)) return null;

  if (request.method === 'OPTIONS') {
    return json(request, env, { ok: true }, 204);
  }

  const auth = await sessionCheck(request, env);
  if (!auth.session?.authenticated) return auth.response;
  if (!env.DB?.prepare) return json(request, env, { error: 'Command Ledger DB가 연결되지 않았습니다.', code: 'COMMAND_LEDGER_DB_UNAVAILABLE' }, 503);

  if (request.method === 'GET' && url.pathname === `${PREFIX}/status`) {
    const [ledger, gateway, readiness] = await Promise.all([
      getEkodiCommandLedgerStatus(env),
      Promise.resolve(getCoreAiGatewayStatus(env, [])),
      getEkodiProviderOperationalReadiness(env),
    ]);
    return json(request, env, {
      ok: true,
      schemaVersion: 1,
      runtime: 'ekodi-v8-command-plane',
      proactive: true,
      durableTaskLedger: true,
      scheduledDrain: true,
      readiness,
      gateway,
      ledger,
    });
  }

  if (request.method === 'GET' && url.pathname === `${PREFIX}/tasks`) {
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 30, 1), 100);
    const state = text(url.searchParams.get('state'), 40).toLowerCase();
    return json(request, env, { ok: true, tasks: await listEkodiCommandTasks(env, { limit, state }) });
  }

  const taskMatch = url.pathname.match(/^\/api\/control\/ai\/v8\/tasks\/([^/]+)$/);
  if (request.method === 'GET' && taskMatch) {
    const task = await getEkodiCommandTask(env, decodeURIComponent(taskMatch[1]), { includeEvent: true });
    if (!task) return json(request, env, { error: 'Command task를 찾을 수 없습니다.', code: 'COMMAND_TASK_NOT_FOUND' }, 404);
    return json(request, env, { ok: true, task });
  }

  if (request.method === 'POST' && url.pathname === `${PREFIX}/pulse`) {
    const body = await readJson(request);
    if (!body) return json(request, env, { error: '유효한 JSON 요청이 필요합니다.', code: 'INVALID_JSON' }, 400);
    const input = pulseInput(body, auth.session);
    if (!input.goal && !input.event.summary) return json(request, env, { error: 'goal 또는 summary가 필요합니다.', code: 'PULSE_GOAL_REQUIRED' }, 400);
    const task = await ingestEkodiPulse(env, input);
    const execution = body.executeNow === true ? await runEkodiCommandQueue(env, { limit: 1 }) : null;
    return json(request, env, { ok: true, queued: Boolean(task), task, execution }, execution ? 200 : 202);
  }

  if (request.method === 'POST' && url.pathname === `${PREFIX}/drain`) {
    const body = await readJson(request) || {};
    const limit = Math.min(Math.max(Number(body.limit) || 1, 1), 3);
    return json(request, env, await runEkodiCommandQueue(env, { limit }));
  }

  return json(request, env, { error: 'EKODI v8 Command 경로를 찾을 수 없습니다.', code: 'COMMAND_CONTROL_NOT_FOUND' }, 404);
}

export const EKODI_V8_COMMAND_CONTROL = Object.freeze({
  version: '1.0.0',
  prefix: PREFIX,
  surfaces: Object.freeze(['status', 'tasks', 'pulse', 'drain']),
});
