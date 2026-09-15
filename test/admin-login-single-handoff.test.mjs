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

test('central admin login pre-opens the Google bridge and keeps canonical admin root return', () => {
  assert.match(adminCore, /return_to=https%3A%2F%2Fekodi\.kr%2Fadmin%2F/);
  assert.match(adminCore, /open\('https:\/\/auth\.ekodi\.kr\/google-origin-bridge\?wait=1','ekodi_google_origin_bridge','popup'\)/);
  assert.match(adminCore, /u\.searchParams\.set\('bridge','preopened'\)/);
  assert.match(adminCore, /location\.assign\(u\)/);
  assert.match(adminCore, /loginLink\.onclick=e=>/);
  assert.doesNotMatch(adminCore, /loginLink\.onclick=null/);
});

test('admin auth consumes a pre-opened bridge before rendering any fallback button', () => {
  assert.match(adminAuth, /const preopenedRequested=directEntry&&params\.get\('bridge'\)==='preopened'/);
  assert.match(adminAuth, /requestPreopenedGoogleCredential\(config,challenge\)/);
  assert.match(adminAuth, /popup\.postMessage\(\{type:'ekodi-google-origin-bridge-start'/);
  assert.match(adminAuth, /renderOriginBridgeButton\(host,config,challenge\)/);
  assert.match(adminAuth, /revealDirectFallback\(/);
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
