import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { handleExternalAccountControl, EXTERNAL_ACCOUNT_PROVIDER_REGISTRY } from '../external-account-control.js';

const root = new URL('../', import.meta.url);
const read = name => fs.readFileSync(new URL(name, root), 'utf8');

test('external account center keeps provider ownership separate', () => {
  const ids = EXTERNAL_ACCOUNT_PROVIDER_REGISTRY.map(item => item.id);
  for (const id of ['google','meta','kakao','naver','microsoft','other']) assert.ok(ids.includes(id));
  const migration = read('migrations/0083_external_account_control_center.sql');
  assert.match(migration, /authority_ref/);
  assert.match(migration, /credential_ref/);
  assert.doesNotMatch(migration, /password/i);
});

test('control route requires central authentication', async () => {
  const response = await handleExternalAccountControl(new Request('https://api.ekodi.kr/api/control/external-accounts/summary'), {});
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, 'auth_required');
});

test('registration rejects direct secret material before persistence', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => String(url).includes('/auth/v1/user')
    ? new Response(JSON.stringify({ id:'u1', email:'joseph@ekodi.kr' }), { status:200, headers:{'content-type':'application/json'} })
    : new Response(JSON.stringify([]), { status:200, headers:{'content-type':'application/json'} });
  try {
    const request = new Request('https://api.ekodi.kr/api/control/external-accounts/accounts', { method:'POST', headers:{ authorization:'Bearer session', 'content-type':'application/json' }, body:JSON.stringify({ workspaceSlug:'platform', provider:'google', providerAccountId:'church@example.com', password:'never-store-this' }) });
    const response = await handleExternalAccountControl(request, { MY_SUPABASE_URL:'https://example.supabase.co', MY_SUPABASE_PUBLISHABLE_KEY:'public-key', ADMIN_GOOGLE_BOOTSTRAP_EMAILS:'topmaster.joseph@gmail.com,joseph@ekodi.kr' });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, 'secret_material_not_accepted');
  } finally { globalThis.fetch = originalFetch; }
});

test('admin UI and mission control expose the central account center', () => {
  assert.match(read('mission-control-entry-worker.js'), /handleExternalAccountControl/);
  assert.match(read('admin-menu-runtime.js'), /external-accounts/);
  assert.match(read('external-account-admin.js'), /외부계정 통합운영센터/);
  assert.doesNotMatch(read('external-account-admin.js'), /name="password"/);
});
