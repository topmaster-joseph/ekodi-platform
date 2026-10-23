import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { EKODIBIZ_ADMIN_SCOPES, ekodiBizAdminScopeForPath } from '../ekodibiz-admin-registry.js';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('retired investment business does not expose a local admin scope', () => {
  assert.equal(EKODIBIZ_ADMIN_SCOPES.some(scope => scope.id === 'invest'), false);
  assert.equal(ekodiBizAdminScopeForPath('/ekodibiz/invest/admin'), '');
});

test('both edge routing layers permanently move retired public and admin paths to EKODIBIZ', async () => {
  for (const file of ['site-worker.js', 'platform-router-entry-worker.js']) {
    const source = await read(file);
    assert.ok(source.includes("ekodibiz\\/invest"), file + ' must cover retired paths');
    assert.ok(source.includes("new URL('/ekodibiz',request.url)"), file);
    assert.ok(source.includes('status:308'), file);
  }
  const shared = await read('site-worker.js');
  assert.doesNotMatch(shared, /ekodibiz-invest-business\\.js|ekodibiz-invest-admin-page\\.js/);
});

test('retired routes and manager surfaces are absent from the deploy manifest and business home', async () => {
  const manifest = JSON.parse(await read('deploy/manifests/shared-site.worker.json'));
  assert.ok(!manifest.worker.requests.some(item => String(item.url).includes('/ekodibiz/invest')));
  const home = await read('ekodibiz/index.html');
  assert.ok(!home.includes('data-business="invest"'));
  const script = await read('ekodibiz/site.js');
  assert.ok(!script.includes("login:'invest'"));
  const core = JSON.parse(await read('platform-boundaries.json'));
  assert.equal(core.platforms.invest.canonicalPath, 'https://ekodi.kr/invest');
});
