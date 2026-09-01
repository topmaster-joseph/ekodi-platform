import authWorker from './auth-worker.js';
import {
  CONTROL_PLANE_PREFIX,
  acceptControlPlaneEvent,
  ensureControlPlaneSchema,
  getControlPlaneContract,
  getControlPlaneJob,
  listControlPlaneJobs,
} from './cognitive-control-plane.js';

const encoder = new TextEncoder();
const CALLER_ID = /^[a-z0-9][a-z0-9._-]{2,63}$/;

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

function secureEqual(a, b) {
  const aa = encoder.encode(String(a || ''));
  const bb = encoder.encode(String(b || ''));
  if (!aa.length || aa.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < aa.length; i += 1) diff |= aa[i] ^ bb[i];
  return diff === 0;
}

function callerRegistry(env) {
  let parsed = [];
  try { parsed = JSON.parse(String(env.EKODI_CONTROL_PLANE_CALLER_REGISTRY_JSON || '[]')); }
  catch { return []; }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(item => item && typeof item === 'object'
    && CALLER_ID.test(String(item.id || ''))
    && String(item.secretBinding || '').trim());
}

function serviceCaller(request, env) {
  const id = String(request.headers.get('x-ekodi-caller-id') || '').trim().toLowerCase();
  const supplied = String(request.headers.get('x-ekodi-control-plane-key') || '');
  if (!CALLER_ID.test(id) || !supplied) return '';
  const caller = callerRegistry(env).find(item => item.id === id && item.enabled !== false);
  if (!caller) return '';
  const expected = String(env[String(caller.secretBinding)] || '');
  return secureEqual(supplied, expected) ? id : '';
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

async function readJson(request) {
  try { return await request.json(); } catch { return null; }
}

export async function handleCognitiveControlPlane(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(CONTROL_PLANE_PREFIX)) return null;

  if (request.method === 'OPTIONS') {
    const headers = new Headers({
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'authorization,content-type,x-ekodi-caller-id,x-ekodi-control-plane-key',
      'access-control-max-age': '86400',
      'cache-control': 'no-store',
    });
    const origin = request.headers.get('origin');
    const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
    if (origin && allowed.includes(origin)) {
      headers.set('access-control-allow-origin', origin);
      headers.set('vary', 'Origin');
    }
    return new Response(null, { status: 204, headers });
  }

  if (!env.DB) return json({ error: 'Cognitive Control Plane DB가 연결되지 않았습니다.', code: 'CONTROL_PLANE_DB_NOT_CONFIGURED' }, 503, request, env);
  await ensureControlPlaneSchema(env.DB);

  if (request.method === 'POST' && url.pathname === `${CONTROL_PLANE_PREFIX}/events`) {
    const caller = serviceCaller(request, env);
    let session = null;
    if (!caller) {
      const auth = await sessionCheck(request, env);
      if (!auth.session?.authenticated) return auth.response;
      session = auth.session;
    }

    const body = await readJson(request);
    if (!body) return json({ error: '유효한 JSON 요청이 필요합니다.', code: 'INVALID_JSON' }, 400, request, env);
    const sourceServiceId = String(body?.source?.service_id || body?.source?.serviceId || '').trim().toLowerCase();
    if (caller && sourceServiceId !== caller) {
      return json({ error: '호출자는 자신의 service_id로만 이벤트를 발행할 수 있습니다.', code: 'CONTROL_PLANE_CALLER_SOURCE_MISMATCH' }, 403, request, env);
    }
    const principal = session || { email: `service:${caller}` };
    const accepted = await acceptControlPlaneEvent(env.DB, principal, body);
    if (!accepted.ok) return json({ error: accepted.error, code: accepted.code }, accepted.status || 400, request, env);
    return json({
      ok: true,
      idempotent: accepted.idempotent,
      principal: caller ? { type: 'service', id: caller } : { type: 'human', id: String(session?.email || '') },
      event: accepted.event,
      job: accepted.job,
      execution: {
        state: 'queued_by_contract',
        note: 'Control Plane은 실행 기능을 직접 포함하지 않으며 capability adapter가 작업을 인수합니다.',
      },
    }, accepted.status, request, env);
  }

  const auth = await sessionCheck(request, env);
  if (!auth.session?.authenticated) return auth.response;

  if (request.method === 'GET' && url.pathname === CONTROL_PLANE_PREFIX) {
    return json({
      ok: true,
      contract: getControlPlaneContract(),
      serviceAuthentication: 'caller_registry_with_independent_secret_binding',
      state: 'operational_core',
      executorState: 'capability_adapters_required',
    }, 200, request, env);
  }

  if (request.method === 'GET' && url.pathname === `${CONTROL_PLANE_PREFIX}/jobs`) {
    return json({ ok: true, jobs: await listControlPlaneJobs(env.DB, url) }, 200, request, env);
  }

  const jobMatch = url.pathname.match(/^\/api\/control\/ai\/control-plane\/jobs\/([^/]+)$/);
  if (request.method === 'GET' && jobMatch) {
    const job = await getControlPlaneJob(env.DB, decodeURIComponent(jobMatch[1]));
    if (!job) return json({ error: 'Control Plane job을 찾을 수 없습니다.', code: 'CONTROL_PLANE_JOB_NOT_FOUND' }, 404, request, env);
    return json({ ok: true, job }, 200, request, env);
  }

  return json({ error: 'Cognitive Control Plane 경로를 찾을 수 없습니다.', code: 'CONTROL_PLANE_NOT_FOUND' }, 404, request, env);
}
