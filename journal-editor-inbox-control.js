// JOURNAL-EDITOR-ALERTS-20261113 — 최고관리자 전용 '저널 새 소식' API(조용한 건수 표시용).
import authWorker from './auth-worker.js';
import { journalInboxSummary, markJournalInboxSeen } from './journal-editor-inbox.js';

export const JOURNAL_INBOX_PATH = '/api/control/journal-inbox';
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: {
  'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' } });

async function superAdmin(request, env) {
  const u = new URL(request.url); u.pathname = '/api/session'; u.search = '';
  const response = await authWorker.fetch(new Request(u.toString(), { method: 'GET', headers: request.headers }), env);
  if (!response.ok) return false;
  const session = await response.json().catch(() => null);
  return Boolean(session?.authenticated && session?.role === 'super_admin');
}
function sameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try { return origin === new URL(request.url).origin; } catch { return false; }
}

export async function handleJournalInboxControl(request, env, { isSuperAdmin = superAdmin } = {}) {
  if (new URL(request.url).pathname !== JOURNAL_INBOX_PATH) return null;
  if (!['GET', 'POST'].includes(request.method)) return json({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405);
  if (!sameOrigin(request)) return json({ ok: false, code: 'ORIGIN_FORBIDDEN' }, 403);
  if (!(await isSuperAdmin(request, env))) return json({ ok: false, code: 'SUPER_ADMIN_ONLY' }, 403);
  if (!env?.DB?.prepare) return json({ ok: false, code: 'DB_UNAVAILABLE' }, 503);
  if (request.method === 'GET') return json(await journalInboxSummary(env.DB));
  const body = await request.json().catch(() => ({}));
  if (body?.action !== 'seen') return json({ ok: false, code: 'UNKNOWN_ACTION' }, 400);
  return json(await markJournalInboxSeen(env.DB));
}
