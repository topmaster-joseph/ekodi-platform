import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

// ---------- Behavioral harness: fake D1 + fake Supabase user endpoint ----------
const TENANT = { id: 7, slug: 'seonammedi', name: '서남권 국립의대 소통센터', domain: 'ekodi.kr/seonammedi', status: 'active' };
const GRANTS = [
  { tenant_id: 7, email: 'manager1@example.com', role: 'manager', enabled: 1, created_at: '2026-10-19T00:00:00Z', last_verified_at: null, principal_type: 'member', github_username: '', expires_at: null, visibility: 'public', display_name: '관리자1', user_last_login_at: '' },
  { tenant_id: 7, email: 'manager2@example.com', role: 'manager', enabled: 1, created_at: '2026-10-19T00:00:00Z', last_verified_at: null, principal_type: 'member', github_username: '', expires_at: null, visibility: 'private', display_name: '', user_last_login_at: '' },
  { tenant_id: 7, email: 'member@example.com', role: 'member', enabled: 1, created_at: '2026-10-19T00:00:00Z', last_verified_at: null, principal_type: 'member', github_username: '', expires_at: null, visibility: 'private', display_name: '', user_last_login_at: '' },
];
const SUPER_ADMINS = new Set(['owner@ekodi.test']);

function fakeDb() {
  const statement = (sql, args = []) => ({
    bind: (...values) => statement(sql, values),
    async first() {
      if (/FROM customer_tenants WHERE slug = \?/.test(sql)) return args[0] === TENANT.slug ? TENANT : null;
      if (/FROM admins WHERE lower\(trim\(email\)\) = \? AND role = 'super_admin'/.test(sql)) return SUPER_ADMINS.has(args[0]) ? { role: 'super_admin' } : null;
      if (/FROM customer_access_grants WHERE tenant_id = \? AND lower\(trim\(email\)\) = \?/.test(sql) || /FROM customer_access_grants\s+WHERE tenant_id = \? AND lower\(trim\(email\)\) = \?/.test(sql)) {
        return GRANTS.find(row => row.tenant_id === args[0] && row.email === args[1]) || null;
      }
      return null;
    },
    async all() {
      if (/FROM customer_access_grants a[\s\S]*WHERE a\.tenant_id = \?/.test(sql)) return { results: GRANTS.filter(row => row.tenant_id === args[0]) };
      return { results: [] };
    },
    async run() { return { success: true }; },
  });
  return { prepare: sql => statement(sql), batch: async items => items.map(() => ({ success: true })), exec: async () => ({}) };
}

function withSupabaseUser(email, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('/auth/v1/user')) {
      const auth = new Headers(init?.headers).get('authorization') || '';
      if (!email || !auth.startsWith('Bearer ')) return new Response('{}', { status: 401 });
      return new Response(JSON.stringify({ id: 'u-' + email, email, email_confirmed_at: '2026-01-01T00:00:00Z' }), { status: 200 });
    }
    return new Response('{}', { status: 404 });
  };
  return Promise.resolve().then(fn).finally(() => { globalThis.fetch = original; });
}

async function callRoster(email) {
  const { handleGoogleCustomerPreregistration } = await import('../customer-google-prereg.js');
  const request = new Request('https://ekodi.kr/api/customers/tenants/seonammedi/admin-roster', { headers: email ? { authorization: 'Bearer test-token' } : {} });
  const response = await withSupabaseUser(email, () => handleGoogleCustomerPreregistration(request, { DB: fakeDb() }));
  return { status: response.status, body: await response.json() };
}

test('platform super admin authenticated by verified Google principal can manage the site admin roster', async () => {
  const { status, body } = await callRoster('owner@ekodi.test');
  assert.equal(status, 200);
  assert.equal(body.viewer.canManage, true);
  assert.equal(body.viewer.scope, 'platform');
  assert.deepEqual(body.admins.map(item => item.email), ['manager1@example.com', 'manager2@example.com']);
  assert.ok(body.roles.some(item => item.role === 'admin'));
});

test('an active site manager sees the roster read-only and ordinary members are excluded', async () => {
  const { status, body } = await callRoster('manager2@example.com');
  assert.equal(status, 200);
  assert.equal(body.viewer.canManage, false);
  assert.equal(body.viewer.scope, 'tenant-readonly');
  assert.equal(body.admins.length, 2);
  assert.ok(body.admins.every(item => item.role !== 'member'));
  assert.ok(body.admins.every(item => !('githubUsername' in item)));
});

test('ordinary members and anonymous callers cannot read the site admin roster', async () => {
  assert.equal((await callRoster('member@example.com')).status, 403);
  assert.equal((await callRoster('stranger@example.com')).status, 403);
  assert.equal((await callRoster('')).status, 401);
});

test('tenant authority grants platform scope only to admins-table super_admin principals', async () => {
  const { resolveTenantAccessAuthority } = await import('../tenant-access-authority.js');
  const request = new Request('https://ekodi.kr/api/customers/directory?tenant=seonammedi', { headers: { authorization: 'Bearer test-token' } });
  const platform = await withSupabaseUser('owner@ekodi.test', () => resolveTenantAccessAuthority(request, { DB: fakeDb() }, { tenantSlug: 'seonammedi' }));
  assert.equal(platform.ok, true);
  assert.equal(platform.scope, 'platform');
  const manager = await withSupabaseUser('manager1@example.com', () => resolveTenantAccessAuthority(request, { DB: fakeDb() }, { tenantSlug: 'seonammedi' }));
  assert.notEqual(manager.scope, 'platform');
});

// ---------- UI contracts ----------
test('super admin settings show a per-site administrator roster with direct edit entry', async () => {
  const runtime = await read('admin-menu-runtime.js');
  assert.match(runtime, /사이트별 관리자 현황/);
  assert.match(runtime, /data-space-admin-overview-list/);
  assert.match(runtime, /function renderSpaceAdminOverview\(\)/);
  assert.match(runtime, /selectSpaceAdminTenant\(slug\)/);
  assert.match(runtime, /seonammedi:'\/seonammedi\/admin\/\?panel=access'/);
  assert.match(runtime, /등록된 사이트·공간 없음/);
});

test('site admin pages mount the shared roster and only super admins get edit/register controls', async () => {
  const [shared, admin, html, build, worker] = await Promise.all([
    read('site-admin-roster.js'), read('sites/seonammedi/public/admin/admin.js'),
    read('sites/seonammedi/public/admin/index.html'), read('scripts/build.mjs'), read('site-worker.js'),
  ]);
  assert.match(shared, /export function mountSiteAdminRoster/);
  assert.match(shared, /\/admin-roster`/);
  assert.match(shared, /data\?\.viewer\?\.canManage/);
  assert.match(shared, /\/access\/update`/);
  assert.match(shared, /\/pre-register`/);
  assert.doesNotMatch(shared, /innerHTML/);
  assert.match(admin, /import\('\/site-admin-roster\.js/);
  assert.match(admin, /tenant:'seonammedi'/);
  assert.match(html, /id="siteAdminRosterEditor" hidden/);
  assert.match(html, /id="siteAdminRoster"/);
  assert.match(admin, /card\.hidden=!state\.me\?\.platform/);
  assert.match(build, /'site-admin-roster\.js'/);
  assert.match(worker, /'\/site-admin-roster\.js'/);
});
