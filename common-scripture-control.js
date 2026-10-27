// 에코디 공통본문 관리 (최고관리자): registered months, per-day devotion coverage, and new-month
// registration requests. Approved months live in config/common-scripture/*.json (reviewed in git and
// served identically to every site); requests submitted here are stored as drafts for promotion.
import authWorker from './auth-worker.js';
import { commonScriptureSnapshot, registeredCommonScriptureMonths } from './common-scripture-registry.js';
import { activityRegistrySnapshot } from './devotional-activities.js';
import { parseScriptureReference } from './bible-core.js';

const PREFIX = '/api/control/common-scripture';
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const text = (value, max) => String(value ?? '').replace(/[<>]/g, '').trim().slice(0, max);

function json(data, status = 200, sourceHeaders = new Headers()) {
  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  for (const name of ['access-control-allow-origin', 'access-control-allow-headers', 'access-control-allow-methods', 'access-control-max-age', 'vary']) {
    const value = sourceHeaders.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(JSON.stringify(data), { status, headers });
}
async function sessionCheck(request, env) {
  const url = new URL(request.url);
  url.pathname = '/api/session';
  url.search = '';
  const response = await authWorker.fetch(new Request(url.toString(), { method: 'GET', headers: request.headers }), env);
  if (!response.ok) return { response };
  return { response, session: await response.clone().json() };
}
async function schema(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS common_scripture_drafts(
    month TEXT PRIMARY KEY, payload_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'submitted',
    submitted_by TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL)`).run();
}
function daysIn(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
async function overrideStatuses(env, month) {
  if (!env.DB) return {};
  const rows = await env.DB.prepare('SELECT date,status FROM devotion_activity_overrides WHERE date LIKE ?').bind(`${month}-%`).all().catch(() => ({ results: [] }));
  return Object.fromEntries((rows.results || []).map(row => [row.date, row.status]));
}
export async function commonScriptureMonthView(env, month) {
  const registry = commonScriptureSnapshot(month);
  if (!registry) return null;
  const activities = activityRegistrySnapshot(month);
  const overrides = await overrideStatuses(env, month);
  const days = registry.readings.map(reading => {
    const curated = activities?.days?.find(item => item.day === reading.day && item.passage === reading.passage);
    return {
      date: reading.date, day: reading.day, passage: reading.passage,
      title: Array.isArray(registry.titles) ? registry.titles[reading.day - 1] || '' : '',
      activity: overrides[reading.date] ? `override-${overrides[reading.date]}` : curated ? 'curated' : 'fallback',
    };
  });
  return {
    month, id: registry.id, status: registry.status, nameKo: registry.nameKo,
    range: registry.range || `${registry.readings[0]?.passage || ''} ~ ${registry.readings.at(-1)?.passage || ''}`,
    approvedBy: registry.approvedBy || '', approvedAt: registry.approvedAt || '', authority: registry.authority || '',
    activityRegistry: activities?.id || null, activityReview: activities?.reviewStatus || null,
    coverage: { curated: days.filter(day => day.activity === 'curated').length, overrides: days.filter(day => day.activity.startsWith('override')).length, total: days.length },
    days,
  };
}
export function validateDraft(raw) {
  const month = text(raw?.month, 7);
  if (!MONTH_RE.test(month)) return { error: 'invalid_month' };
  if (registeredCommonScriptureMonths().includes(month)) return { error: 'month_already_registered' };
  const lines = (Array.isArray(raw?.days) ? raw.days : []).map(day => ({ passage: text(day?.passage, 80), title: text(day?.title, 80) }));
  if (lines.length !== daysIn(month)) return { error: 'day_count_mismatch', expected: daysIn(month), received: lines.length };
  const invalid = lines.map((line, index) => (parseScriptureReference(line.passage) ? null : index + 1)).filter(Boolean);
  if (invalid.length) return { error: 'invalid_passage', days: invalid };
  return { month, days: lines, note: text(raw?.note, 500) };
}
export async function handleCommonScriptureControl(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(PREFIX)) return null;
  const auth = await sessionCheck(request, env);
  if (!auth.session) return auth.response;
  const headers = auth.response.headers;
  if (request.method === 'GET' && url.pathname === PREFIX) {
    const months = [];
    for (const month of registeredCommonScriptureMonths()) months.push(await commonScriptureMonthView(env, month));
    let drafts = [];
    if (env.DB) {
      await schema(env.DB);
      const rows = await env.DB.prepare('SELECT month,payload_json,status,submitted_by,note,updated_at FROM common_scripture_drafts ORDER BY month DESC LIMIT 24').all();
      drafts = (rows.results || []).map(row => ({ ...row, payload: JSON.parse(row.payload_json || '{}'), payload_json: undefined }));
    }
    return json({ ok: true, months, drafts, role: auth.session.role }, 200, headers);
  }
  if (request.method === 'POST' && url.pathname === `${PREFIX}/drafts`) {
    if (String(auth.session.role || '') !== 'super_admin') return json({ ok: false, error: '최고관리자만 공통본문 등록을 요청할 수 있습니다.', code: 'SUPER_ADMIN_REQUIRED' }, 403, headers);
    if (!env.DB) return json({ ok: false, error: '운영 DB가 연결되지 않았습니다.', code: 'DB_NOT_CONFIGURED' }, 503, headers);
    if (Number(request.headers.get('content-length') || 0) > 20000) return json({ ok: false, error: 'too_large' }, 413, headers);
    const draft = validateDraft(await request.json().catch(() => null));
    if (draft.error) return json({ ok: false, ...draft }, 422, headers);
    await schema(env.DB);
    const now = new Date().toISOString();
    await env.DB.prepare(`INSERT INTO common_scripture_drafts(month,payload_json,status,submitted_by,note,updated_at) VALUES(?,?,?,?,?,?)
      ON CONFLICT(month) DO UPDATE SET payload_json=excluded.payload_json,status='submitted',submitted_by=excluded.submitted_by,note=excluded.note,updated_at=excluded.updated_at`)
      .bind(draft.month, JSON.stringify({ days: draft.days }), 'submitted', String(auth.session.email || ''), draft.note, now).run();
    return json({ ok: true, month: draft.month, status: 'submitted', updatedAt: now }, 201, headers);
  }
  return json({ ok: false, error: '지원하지 않는 공통본문 작업입니다.', code: 'COMMON_SCRIPTURE_ROUTE_NOT_FOUND' }, 404, headers);
}
