import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const adminCore = await readFile(`${root}admin-central-handoff.js`, 'utf8');
const adminAuth = await readFile(`${root}auth-site/admin-auth.js`, 'utf8');
const bridge = await readFile(`${root}auth-site/google-origin-bridge.js`, 'utf8');
const bridgeHtml = await readFile(`${root}auth-site/google-origin-bridge.html`, 'utf8');
const authRouter = await readFile(`${root}auth-site/auth-router.js`, 'utf8');
const authHtml = await readFile(`${root}auth-site/index.html`, 'utf8');

test('central admin login navigates to canonical auth without pre-opening a cross-origin bridge', () => {
  assert.match(adminCore, /return_to=https%3A%2F%2Fekodi\.kr%2Fadmin%2F/);
  assert.match(adminCore, /loginLink\.href=route\?centralAdminAuthUrl\(route\):AUTH_URL/);
  assert.match(adminCore, /loginLink\.onclick=null/);
  assert.doesNotMatch(adminCore, /google-origin-bridge\?wait=1/);
  assert.doesNotMatch(adminCore, /bridge','preopened/);
  assert.doesNotMatch(adminCore, /bridge=preopened/);
});

test('admin auth keeps the explicit Google bridge button as the fallback path', () => {
  assert.match(adminAuth, /const preopenedRequested=directEntry&&params\.get\('bridge'\)==='preopened'/);
  assert.match(adminAuth, /renderOriginBridgeButton\(host,config,challenge\)/);
});

test('Google origin bridge keeps strict origin and account-selection safety', () => {
  assert.match(bridge, /const TARGET_ORIGIN='https:\/\/ekodi\.kr'/);
  assert.match(bridge, /event\.origin!==TARGET_ORIGIN\|\|event\.source!==window\.opener/);
  assert.match(bridge, /clientId===EXPECTED_CLIENT/);
  assert.match(bridge, /auto_select:false/);
  assert.match(bridge, /google\.accounts\.id\.renderButton/);
  assert.match(bridge, /google\.accounts\.id\.prompt/);
});

test('single-handoff keeps the existing no-store auth asset contract', () => {
  assert.match(authRouter, /admin-auth\.js\?v=20260909-origin-bridge-1/);
  assert.match(authHtml, /auth-router\.js\?v=20260904-direct-login-1/);
  assert.match(bridgeHtml, /google-origin-bridge\.js/);
});
