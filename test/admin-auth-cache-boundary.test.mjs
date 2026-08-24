import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const worker = await readFile(new URL('../site-worker.js', import.meta.url), 'utf8');
const authIndex = await readFile(new URL('../auth-site/index.html', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../deploy/manifests/shared-site.worker.json', import.meta.url), 'utf8'));

test('critical admin auth assets cannot remain stale in the browser cache', () => {
  assert.match(worker, /AUTH_CRITICAL_ASSETS = new Set\(\['\/auth-router\.js','\/admin-auth\.js'\]\)/);
  assert.match(worker, /AUTH_CRITICAL_ASSETS\.has\(url\.pathname\) \? 'no-store'/);
  assert.match(authIndex, /auth-router\.js\?v=20260824-return-origin-1/);
});

test('guarded production release verifies current mobile-safe admin auth assets', () => {
  const requests = manifest.worker.requests;
  const root = requests.find(item => item.url === 'https://auth.ekodi.kr/');
  const router = requests.find(item => item.url === 'https://auth.ekodi.kr/auth-router.js');
  const admin = requests.find(item => item.url === 'https://auth.ekodi.kr/admin-auth.js');
  assert.ok(root);
  assert.ok(router);
  assert.ok(admin);
  assert.ok(root.expect.some(item => item.includes('auth-router.js?v=20260824-return-origin-1')));
  assert.ok(router.expect.includes('admin-auth.js?v=20260823-mobile-handoff-1'));
  assert.ok(router.expect.includes('client-auth.js?v=20260824-return-origin-1'));
  assert.ok(admin.expect.includes('use_fedcm_for_button:supportsFedCmButton()'));
  assert.ok(admin.expect.includes('isEmbeddedWebView'));
  assert.ok(admin.expect.includes('Chrome에서 관리자 로그인 열기'));
  assert.ok(admin.expect.includes('location.replace(targetHref)'));
  assert.ok(admin.expect.includes('button_auto_select:false'));
  assert.ok(admin.headerExpect.includes('cache-control: no-store'));
});
