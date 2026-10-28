import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../'+path,import.meta.url),'utf8');
const oldAuthHostname = ['auth','ekodi','kr'].join('.');
const oldAdminHostname = ['admin','ekodi','kr'].join('.');
const expected = 'https://ekodi.kr/auth/';

test('Community login always sends to apex auth with exact initiating return', () => {
  const content = read('community/community-enhancements.js');
  assert.ok(content.includes("new URL('"+expected+"')"));
  assert.ok(content.includes("u.searchParams.set('return_to',location.href.split('#')[0])"));
  assert.ok(!content.includes('https://'+oldAuthHostname+'/'));
});

test('Delivery account and Worker pin apex authentication despite stale ENV override', () => {
  const account = read('delivery/account.js');
  const worker = read('delivery-worker.js');
  assert.ok(account.includes("new URL('"+expected+"')"));
  assert.ok(account.includes("url.hostname==='ekodi.kr'&&url.pathname.startsWith('/delivery')"));
  assert.ok(worker.includes("authUrl:'"+expected+"?site=delivery'"));
  assert.ok(!worker.includes('env.AUTH_URL||'));
  assert.ok(worker.includes("form-action 'self' https://ekodi.kr"));
  assert.ok(worker.includes("Response.redirect('https://ekodi.kr/admin/',307)"));
  for (const source of [account,worker]){
    assert.ok(!source.includes('https://'+oldAuthHostname+'/'));
    assert.ok(!source.includes('https://'+oldAdminHostname+'/'));
  }
});

test('Delivery production and staging config use one canonical /auth path', () => {
  for (const file of ['wrangler.delivery.toml','wrangler.delivery.staging.toml']){
    const content=read(file);
    assert.ok(content.includes('AUTH_URL = "'+expected+'?site=delivery"'),file);
    assert.ok(!content.includes('https://'+oldAuthHostname+'/'),file);
  }
});
