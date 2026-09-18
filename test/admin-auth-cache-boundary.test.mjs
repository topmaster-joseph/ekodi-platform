import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const worker = await readFile(new URL('../site-worker.js', import.meta.url), 'utf8');
const authIndex = await readFile(new URL('../auth-site/index.html', import.meta.url), 'utf8');
const authBootstrap = await readFile(new URL('../auth-site/auth-bootstrap.js', import.meta.url), 'utf8');
const authEntry = await readFile(new URL('../auth-site/auth-entry.js', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../deploy/manifests/shared-site.worker.json', import.meta.url), 'utf8'));
const siteConfig = await readFile(new URL('../wrangler.site.toml', import.meta.url), 'utf8');

const criticalAuthAssets = ['/auth.js', '/auth-bootstrap.js', '/auth-entry.js', '/auth-router.js', '/marketing-auth-hotfix.js', '/auth-workspace-target.js', '/admin-auth.js', '/google-origin-bridge.js', '/client-auth.js', '/author-auth.js', '/business-auth.js', '/marketing-onboarding.js', '/membership-ui.js'];

test('critical central auth JavaScript cannot remain stale in the browser or edge cache', () => {
  for (const asset of criticalAuthAssets) {
    assert.match(worker, new RegExp(`AUTH_CRITICAL_ASSETS[\\s\\S]*?${asset.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}`));
    assert.ok(siteConfig.includes(`"${asset}"`), `${asset} must be Worker-first so candidate and production security headers match`);
  }
  assert.match(worker, /AUTH_CRITICAL_ASSETS\.has\(url\.pathname\) \? 'no-store'/);
  assert.match(authIndex, /auth-bootstrap\.js\?v=20260918-csp-bootstrap-1/);
  assert.match(authIndex, /auth-entry\.js\?v=20260918-csp-bootstrap-1/);
});

test('central auth entry stays executable under restrictive CSP without inline JavaScript', () => {
  assert.doesNotMatch(authIndex, /<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/i);
  assert.match(authBootstrap, /dataset\.identityManage/);
  assert.match(authBootstrap, /dataset\.seamlessSso/);
  assert.match(authBootstrap, /dataset\.adminDirectBridge/);
  assert.match(authEntry, /import\('\.\/auth-router\.js\?v=20260918-csp-bootstrap-1'\)/);
  assert.match(authEntry, /dataset\.authLoopBlocked/);
  const authCsp = worker.match(/const AUTH_CSP = \[[\s\S]*?\]\.join\('; '\);/)?.[0] || '';
  assert.ok(authCsp, 'AUTH_CSP block must remain present');
  assert.doesNotMatch(authCsp, /script-src[^\n]*'unsafe-inline'/);
});

test('guarded production release verifies current auth entry, bridge and workspace handoff assets', () => {
  const requests = manifest.worker.requests;
  const root = requests.find(item => item.url === 'https://ekodi.kr/auth/');
  const bootstrap = requests.find(item => item.url.startsWith('https://ekodi.kr/auth/auth-bootstrap.js'));
  const entry = requests.find(item => item.url.startsWith('https://ekodi.kr/auth/auth-entry.js'));
  const router = requests.find(item => item.url.startsWith('https://ekodi.kr/auth/auth-router.js'));
  const client = requests.find(item => item.url.startsWith('https://ekodi.kr/auth/client-auth.js'));
  const workspaceTarget = requests.find(item => item.url.startsWith('https://ekodi.kr/auth/auth-workspace-target.js'));
  const admin = requests.find(item => item.url.startsWith('https://ekodi.kr/auth/admin-auth.js'));
  const bridgeDoc = requests.find(item => item.url === 'https://ekodi.kr/auth/google-origin-bridge');
  const bridgeScript = requests.find(item => item.url === 'https://ekodi.kr/auth/google-origin-bridge.js');
  for (const probe of [root, bootstrap, entry, router, client, workspaceTarget, admin, bridgeDoc, bridgeScript]) assert.ok(probe);
  assert.ok(root.expect.includes('/auth/auth-bootstrap.js?v=20260918-csp-bootstrap-1'));
  assert.ok(root.expect.includes('/auth/auth-entry.js?v=20260918-csp-bootstrap-1'));
  assert.ok(bootstrap.expect.includes('dataset.seamlessSso'));
  assert.ok(entry.expect.includes("./auth-router.js?v=20260918-csp-bootstrap-1"));
  assert.ok(router.expect.includes('admin-auth.js?v=20260918-canonical-origin-2'));
  assert.ok(router.expect.includes('business-auth.js?v=20260826-free-fallback-1'));
  assert.ok(router.expect.includes('client-auth.js?v=20260904-direct-login-1'));
  assert.ok(client.expect.includes('/session/handoff'));
  assert.ok(client.expect.includes('session_timeout'));
  assert.ok(workspaceTarget.expect.includes('workspace_key:requested'));
  assert.ok(workspaceTarget.expect.includes('serviceOrigins'));
  assert.ok(admin.expect.includes('GOOGLE_BRIDGE_ORIGIN=runtime.authOrigin'));
  assert.ok(admin.expect.includes('requestGoogleCredential'));
  assert.ok(admin.expect.includes('renderOriginBridgeButton'));
  assert.ok(admin.expect.includes('event.origin!==GOOGLE_BRIDGE_ORIGIN'));
  assert.ok(admin.expect.includes('directEntry'));
  assert.ok(admin.expect.includes('isEmbeddedWebView'));
  assert.ok(admin.expect.includes('location.replace(targetHref)'));
  assert.ok(bridgeDoc.expect.includes('/google-origin-bridge.js'));
  assert.ok(bridgeScript.expect.includes('CLIENT_IDS=Object.freeze'));
  assert.ok(bridgeScript.expect.includes('use_fedcm_for_button:false'));
  assert.ok(bridgeScript.expect.includes('window.opener.postMessage'));
  for (const probe of [root, bootstrap, entry, router, client, workspaceTarget, admin, bridgeDoc, bridgeScript]) {
    assert.ok(probe.headerExpect?.includes('cache-control: no-store') || probe === root);
    assert.equal(probe.rollbackVerify, false);
  }
});
