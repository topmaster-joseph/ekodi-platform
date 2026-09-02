import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [registry, adminJs, adminCss, domainsJs, build, worker] = await Promise.all([
  read('admin-menu-registry.js'), read('google-admin-auth.js'), read('google-admin-auth.css'),
  read('domains-hub.js'), read('scripts/build.mjs'), read('site-worker.js')
]);

test('Admin remains visible while Domains is no longer a global navigation axis', () => {
  assert.match(registry, /id: 'admins'/);
  assert.doesNotMatch(registry, /id: 'domains'/);
});

test('Admin accounts keep guarded two-column permission management', () => {
  assert.match(adminJs, /google-admin-toolbar/);
  assert.match(adminJs, /google-admin-filters/);
  assert.match(adminCss, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(adminJs, /최소 1명의 활성 최고관리자는 반드시 유지해야 합니다/);
  assert.match(adminJs, /method: 'DELETE'/);
});
test('Domains remains a read-first service hub, not a browser DNS editor', () => {
  assert.match(domainsJs, /api\('\/api\/control\/overview'\)/);
  assert.match(domainsJs, /Services에서 관리 →/);
  assert.doesNotMatch(domainsJs, /\/api\/dns/);
  assert.doesNotMatch(domainsJs, /method: 'PUT'|method: 'POST'/);
});

test('Domains assets remain deployable behind Admin edge security', () => {
  for (const asset of ['domains-hub.css', 'domains-hub.js']) {
    assert.ok(build.includes(`'${asset}'`), `${asset} must be copied into dist`);
    assert.ok(worker.includes(`'/${asset}'`), `${asset} must be an admin asset`);
  }
});
