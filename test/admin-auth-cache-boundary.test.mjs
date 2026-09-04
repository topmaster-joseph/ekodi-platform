import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const worker = await readFile(new URL('../site-worker.js', import.meta.url), 'utf8');
const authIndex = await readFile(new URL('../auth-site/index.html', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../deploy/manifests/shared-site.worker.json', import.meta.url), 'utf8'));
const siteConfig = await readFile(new URL('../wrangler.site.toml', import.meta.url), 'utf8');

const criticalAuthAssets = ['/auth.js', '/auth-router.js', '/marketing-auth-hotfix.js', '/auth-workspace-target.js', '/admin-auth.js', '/client-auth.js', '/author-auth.js', '/business-auth.js', '/marketing-onboarding.js', '/membership-ui.js'];

test('critical central auth JavaScript cannot remain stale in the browser or edge cache', () => {
  for (const asset of criticalAuthAssets) {
    assert.match(worker, new RegExp(`AUTH_CRITICAL_ASSETS[\\s\\S]*?${asset.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}`));
    assert.ok(siteConfig.includes(`"${asset}"`), `${asset} must be Worker-first so candidate and production security headers match`);
  }
  assert.match(worker, /AUTH_CRITICAL_ASSETS\.has\(url\.pathname\) \? 'no-store'/);
  assert.match(authIndex, /auth-router\.js\?v=20260904-direct-login-1/);
});

test('guarded production release verifies current auth entry and workspace handoff assets', () => {
  const requests = manifest.worker.requests;
  const root = requests.find(item => item.url === 'https://auth.ekodi.kr/');
  const router = requests.find(item => item.url.startsWith('https://auth.ekodi.kr/auth-router.js'));
  const client = requests.find(item => item.url.startsWith('https://auth.ekodi.kr/client-auth.js'));
  const workspaceTarget = requests.find(item => item.url.startsWith('https://auth.ekodi.kr/auth-workspace-target.js'));
  const admin = requests.find(item => item.url.startsWith('https://auth.ekodi.kr/admin-auth.js'));
  assert.ok(root);
  assert.ok(router);
  assert.ok(client);
  assert.ok(workspaceTarget);
  assert.ok(admin);
  assert.ok(root.expect.includes('/auth-router.js?v=20260904-direct-login-1'));
  assert.ok(router.expect.includes('admin-auth.js?v=20260904-centered-popup-1'));
  assert.ok(router.expect.includes('business-auth.js?v=20260826-free-fallback-1'));
  assert.ok(router.expect.includes('client-auth.js?v=20260904-direct-login-1'));
  assert.ok(router.expect.includes('isRegistryUserService'));
  assert.ok(client.expect.includes('/session/handoff'));
  assert.ok(client.expect.includes('session_timeout'));
  assert.ok(client.headerExpect.includes('cache-control: no-store'));
  assert.ok(workspaceTarget.expect.includes('workspace_key:requested'));
  assert.ok(workspaceTarget.expect.includes('serviceOrigins'));
  assert.ok(workspaceTarget.headerExpect.includes('cache-control: no-store'));
  assert.ok(admin.expect.includes('use_fedcm_for_button:supportsFedCmButton()'));
  assert.ok(admin.expect.includes('isEmbeddedWebView'));
  assert.ok(admin.expect.includes('Chrome에서 관리자 로그인 열기'));
  assert.ok(admin.expect.includes('location.replace(targetHref)'));
  assert.ok(admin.expect.includes('button_auto_select:false'));
  assert.ok(admin.headerExpect.includes('cache-control: no-store'));
});