import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getAdminMenuLabel } from '../admin-menu-registry.js';
import { workspaceAdminScript } from '../workspace-admin-page.js';
import { storeAdminScript, storeAdminCanAccess } from '../store-admin-engine.js';

const manifest = JSON.parse(await readFile(new URL('../deploy/manifests/shared-site.worker.json', import.meta.url), 'utf8'));

test('channel and autopost navigation is named consistently across administrator surfaces', async () => {
  assert.equal(getAdminMenuLabel('social','ko'),'채널·자동게시');

  const workspace = await (await workspaceAdminScript()).text();
  assert.match(workspace,/소통 · 홍보/);
  assert.match(workspace,/마케팅 AI/);
  assert.match(workspace,/채널·자동게시/);
  assert.match(workspace,/publishing:\['SNS','채널','계정 연결','OAuth','쇼츠','자동게시','예약게시'\]/);

  const store = await (await storeAdminScript()).text();
  assert.match(store,/마케팅 · 채널/);
  assert.match(store,/마케팅 AI/);
  assert.match(store,/채널·자동게시/);
  assert.match(store,/publishing:\['SNS','채널','계정 연결','OAuth','자동게시','예약게시','쇼츠'\]/);
  assert.equal(storeAdminCanAccess('store_owner','publishing'),true);
  assert.equal(storeAdminCanAccess('marketing_manager','publishing'),true);
});

test('guarded production release probes every canonical autopost administrator link', () => {
  const byUrl = new Map(manifest.worker.requests.map(row => [row.url,row]));
  const expected = [
    ['https://ekodi.kr/ekodibiz/admin/publishing','workspace-admin'],
    ['https://ekodi.kr/jadam/admin/publishing','jadam-store-admin'],
    ['https://ekodi.kr/pizzamaru/admin/publishing','pizzamaru-store-admin'],
    ['https://ekodi.kr/yogurt/admin/publishing','yogurt-store-admin'],
  ];
  for (const [url, route] of expected) {
    const row = byUrl.get(url);
    assert.ok(row, `missing production probe: ${url}`);
    assert.deepEqual(row.statuses,[200]);
    assert.ok(row.headerExpect.includes(`x-ekodi-route: ${route}`));
    assert.equal(row.rollbackVerify,false);
  }
});
