import test from 'node:test';
import assert from 'node:assert/strict';
import { devotionViewer, devotionAdminSession } from '../devotional-admin-api.js';

const JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEiLCJlbWFpbCI6ImEifQ.c2lnbmF0dXJlLXNpZ25hdHVyZQ';
function dbWith(rows) {
  return { prepare(sql) { return { bind(...args) { return { async first() { return rows(sql, args); } }; } }; } };
}
function withFetch(handler, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  return fn().finally(() => { globalThis.fetch = original; });
}
const env = (db) => ({ SUPABASE_URL: 'https://sb.test', SUPABASE_PUBLISHABLE_KEY: 'pk', DB: db });
const request = token => new Request('https://ekodi.kr/bible/api/bible/devotion/me', { headers: token ? { authorization: `Bearer ${token}` } : {} });

function supabase({ email = 'pastor@example.com', confirmed = true, staffRole = null, contexts = [] } = {}) {
  return async (url) => {
    const u = String(url);
    if (u.endsWith('/auth/v1/user')) return Response.json({ id: 'user-1', email, email_confirmed_at: confirmed ? '2026-01-01' : null });
    if (u.includes('/rest/v1/church_staff')) return Response.json(staffRole ? [{ role: staffRole }] : []);
    if (u.includes('/rpc/current_site_activity_contexts')) return Response.json(contexts);
    return new Response('{}', { status: 404 });
  };
}

test('member whose verified email is a D1 super_admin gets the full admin menu and edit right', () =>
  withFetch(supabase({ email: 'joseph@ekodi.kr' }), async () => {
    const db = dbWith((sql, args) => sql.includes('FROM admins WHERE lower(email)') && args[0] === 'joseph@ekodi.kr' ? { email: 'joseph@ekodi.kr', role: 'super_admin' } : null);
    const viewer = await devotionViewer(request(JWT), env(db));
    assert.equal(viewer.superAdmin, true);
    assert.ok(await devotionAdminSession(request(JWT), env(db)));
  }));

test('unverified email never becomes super admin; operator role is not super admin', () =>
  withFetch(supabase({ email: 'joseph@ekodi.kr', confirmed: false }), async () => {
    const db = dbWith(() => ({ email: 'joseph@ekodi.kr', role: 'super_admin' }));
    assert.equal((await devotionViewer(request(JWT), env(db))).superAdmin, false);
    assert.equal(await devotionAdminSession(request(JWT), env(db)), null);
  }).then(() => withFetch(supabase({ email: 'op@ekodi.kr' }), async () => {
    const db = dbWith(() => ({ email: 'op@ekodi.kr', role: 'operator' }));
    assert.equal((await devotionViewer(request(JWT), env(db))).superAdmin, false);
  })));

test('church staff and mission tenant admins get their own menu only; members get none', async () => {
  const db = dbWith(() => null);
  await withFetch(supabase({ staffRole: 'senior_pastor' }), async () => {
    const v = await devotionViewer(request(JWT), env(db));
    assert.deepEqual([v.superAdmin, v.churchAdmin, v.missionAdmin], [false, true, false]);
  });
  await withFetch(supabase({ contexts: [{ tenant: 'ekodimission', authorization_role: 'tenant_admin' }] }), async () => {
    const v = await devotionViewer(request(JWT), env(db));
    assert.deepEqual([v.superAdmin, v.churchAdmin, v.missionAdmin], [false, false, true]);
  });
  await withFetch(supabase({ staffRole: 'member', contexts: [{ tenant: 'ekodimission', authorization_role: 'member' }] }), async () => {
    const v = await devotionViewer(request(JWT), env(db));
    assert.deepEqual([v.authenticated, v.superAdmin, v.churchAdmin, v.missionAdmin], [true, false, false, false]);
  });
});

test('rejected or missing tokens yield an anonymous viewer', () =>
  withFetch(async () => new Response('{}', { status: 401 }), async () => {
    const db = dbWith(() => ({ email: 'x', role: 'super_admin' }));
    assert.equal((await devotionViewer(request(JWT), env(db))).authenticated, false);
    assert.equal((await devotionViewer(request(''), env(db))).authenticated, false);
  }));
