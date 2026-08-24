import authWorker from './auth-worker.js';
import { USER_SERVICES } from './generated/user-services.js';

const PUBLIC_PATH = '/api/homepage/presentation';
const CONTROL_PATH = '/api/control/homepage';
const VISIBILITIES = new Set(['hidden', 'normal', 'featured']);
const CATALOG = new Map(USER_SERVICES.map(service => [service.id, service]));

function allowedOrigin(request, env, publicRead = false) {
  const origin = String(request.headers.get('origin') || '').trim();
  if (!origin) return '';
  if (publicRead && ['https://ekodi.kr', 'https://www.ekodi.kr'].includes(origin)) return origin;
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
  return allowed.includes(origin) ? origin : '';
}

function json(data, status = 200, origin = '', methods = 'GET, PUT, OPTIONS') {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  if (origin) {
    headers.set('access-control-allow-origin', origin);
    headers.set('access-control-allow-headers', 'authorization, content-type');
    headers.set('access-control-allow-methods', methods);
    headers.set('access-control-max-age', '600');
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

async function adminIdForSession(env, session) {
  const row = await env.DB.prepare('SELECT id FROM admins WHERE email = ?').bind(session.email).first();
  return row?.id || null;
}

function defaultVisibility(service) {
  if (!service.homepageEligible) return 'hidden';
  return service.homepageDefault ? 'normal' : 'hidden';
}

function publicCatalogEntry(service, override) {
  const visibility = override?.visibility || defaultVisibility(service);
  const displayOrder = Number.isInteger(Number(override?.display_order))
    ? Number(override.display_order)
    : Number(service.homepageOrder ?? 9999);
  return {
    id: service.id,
    visibility: service.homepageEligible ? visibility : 'hidden',
    order: displayOrder,
  };
}

async function readControls(env) {
  const rows = await env.DB.prepare(`SELECT service_id, visibility, display_order, updated_at
    FROM homepage_presentation_controls
    ORDER BY display_order, service_id`).all();
  return new Map(rows.results.map(row => [row.service_id, row]));
}

async function publicPresentation(request, env) {
  if (!env.DB) return json({ error: '데이터베이스 연결이 설정되지 않았습니다.' }, 503, allowedOrigin(request, env, true), 'GET, OPTIONS');
  const controls = await readControls(env);
  return json({
    version: 1,
    generatedAt: new Date().toISOString(),
    services: USER_SERVICES.filter(service => service.homepageEligible).map(service => publicCatalogEntry(service, controls.get(service.id))),
  }, 200, allowedOrigin(request, env, true), 'GET, OPTIONS');
}

async function controlOverview(request, env, sessionResponse) {
  const controls = await readControls(env);
  const services = USER_SERVICES.map(service => {
    const override = controls.get(service.id);
    const effective = publicCatalogEntry(service, override);
    return {
      id: service.id,
      name: service.name,
      nameEn: service.nameEn,
      label: service.label,
      url: service.url,
      domain: service.domain,
      group: service.group,
      status: service.status,
      productionVerified: service.productionVerified,
      homepageEligible: service.homepageEligible,
      defaultVisibility: defaultVisibility(service),
      defaultOrder: service.homepageOrder,
      visibility: effective.visibility,
      order: effective.order,
      overridden: Boolean(override),
      updatedAt: override?.updated_at || null,
    };
  });
  return json({ version: 1, services }, 200, sessionResponse.headers.get('access-control-allow-origin') || allowedOrigin(request, env));
}

function normalizeControl(input) {
  const id = String(input?.id || '').trim().toLowerCase();
  const service = CATALOG.get(id);
  if (!service) throw new Error(`등록되지 않은 서비스입니다: ${id || '(없음)'}`);
  const visibility = String(input?.visibility || '').trim().toLowerCase();
  if (!VISIBILITIES.has(visibility)) throw new Error(`${id}: 표시상태가 올바르지 않습니다.`);
  if (!service.homepageEligible && visibility !== 'hidden') {
    throw new Error(`${id}: 운영 검증이 완료되지 않아 첫화면에 공개할 수 없습니다.`);
  }
  const order = Math.trunc(Number(input?.order));
  if (!Number.isInteger(order) || order < 0 || order > 9999) throw new Error(`${id}: 표시순서는 0~9999 범위여야 합니다.`);
  return { id, visibility, order };
}

async function saveControls(request, env, session, sessionResponse) {
  let body;
  try { body = await request.json(); } catch { body = null; }
  const rawControls = Array.isArray(body?.services) ? body.services : [];
  if (!rawControls.length || rawControls.length > 100) {
    return json({ error: '첫화면 서비스 설정 목록을 확인해 주세요.' }, 400, sessionResponse.headers.get('access-control-allow-origin') || allowedOrigin(request, env));
  }

  let controls;
  try { controls = rawControls.map(normalizeControl); }
  catch (error) { return json({ error: error.message }, 400, sessionResponse.headers.get('access-control-allow-origin') || allowedOrigin(request, env)); }

  const ids = controls.map(item => item.id);
  if (new Set(ids).size !== ids.length) {
    return json({ error: '같은 서비스를 중복 저장할 수 없습니다.' }, 400, sessionResponse.headers.get('access-control-allow-origin') || allowedOrigin(request, env));
  }

  const adminId = await adminIdForSession(env, session);
  const updatedAt = new Date().toISOString();
  const statement = env.DB.prepare(`INSERT INTO homepage_presentation_controls
    (service_id, visibility, display_order, updated_at, updated_by)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(service_id) DO UPDATE SET
      visibility = excluded.visibility,
      display_order = excluded.display_order,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by`);
  await env.DB.batch(controls.map(item => statement.bind(item.id, item.visibility, item.order, updatedAt, adminId)));

  await env.DB.prepare(`INSERT INTO audit_logs
    (admin_id, action, resource, detail, created_at)
    VALUES (?, 'homepage.presentation.update', 'ekodi.kr', ?, ?)`)
    .bind(adminId, JSON.stringify({ services: controls }).slice(0, 500), updatedAt).run();

  return controlOverview(request, env, sessionResponse);
}

export async function handleHomepagePresentation(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (path !== PUBLIC_PATH && path !== CONTROL_PATH) return null;

  const origin = allowedOrigin(request, env, path === PUBLIC_PATH);
  if (request.method === 'OPTIONS') return json({ ok: true }, 200, origin, path === PUBLIC_PATH ? 'GET, OPTIONS' : 'GET, PUT, OPTIONS');
  if (path === PUBLIC_PATH) {
    if (request.method !== 'GET') return json({ error: 'Method Not Allowed' }, 405, origin, 'GET, OPTIONS');
    return publicPresentation(request, env);
  }

  if (!env.DB) return json({ error: '데이터베이스 연결이 설정되지 않았습니다.' }, 503, origin);
  const auth = await sessionCheck(request, env);
  if (!auth.session) return auth.response;
  if (request.method === 'GET') return controlOverview(request, env, auth.response);
  if (request.method === 'PUT') return saveControls(request, env, auth.session, auth.response);
  return json({ error: 'Method Not Allowed' }, 405, auth.response.headers.get('access-control-allow-origin') || origin);
}
