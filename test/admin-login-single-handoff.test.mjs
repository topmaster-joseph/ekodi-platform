import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const adminCore = await readFile(`${root}admin-central-handoff.js`, 'utf8');
const adminDirect = await readFile(`${root}admin-direct-google.js`, 'utf8');
const adminShell = await readFile(`${root}admin-shell.html`, 'utf8');
const shellInjector = await readFile(`${root}ekodi-shell-injector.js`, 'utf8');
const build = await readFile(`${root}scripts/build.mjs`, 'utf8');
const adminAuth = await readFile(`${root}auth-site/admin-auth.js`, 'utf8');
const clientAuth = await readFile(`${root}auth-site/client-auth.js`, 'utf8');
const bridge = await readFile(`${root}auth-site/google-origin-bridge.js`, 'utf8');
const bridgeHtml = await readFile(`${root}auth-site/google-origin-bridge.html`, 'utf8');
const authRouter = await readFile(`${root}auth-site/auth-router.js`, 'utf8');
const authHtml = await readFile(`${root}auth-site/index.html`, 'utf8');
const authEntry = await readFile(`${root}auth-site/auth-entry.js`, 'utf8');

test('every Admin Shell preopens the canonical Google chooser before navigating through auth', () => {
  assert.match(adminDirect, /google-origin-bridge\?wait=1/);
  assert.match(adminDirect, /window\.open\(bridge\.href,'ekodi_google_origin_bridge'/);
  assert.match(adminDirect, /auth\.searchParams\.set\('direct','1'\)/);
  assert.match(adminDirect, /auth\.searchParams\.set\('bridge','preopened'\)/);
  assert.match(adminDirect, /location\.assign\(auth\.href\)/);
  assert.match(shellInjector, /adminDirectGoogle=surface==='admin'/);
  assert.match(shellInjector, /admin-direct-google\.js\?v=20260924-v1/);
  assert.match(adminShell, /admin-direct-google\.js\?v=20260924-v1/);
  assert.match(build, /'admin-direct-google\.js'/);
});

test('platform admin keeps canonical return_to while the direct helper owns the click handoff', () => {
  assert.match(adminCore, /return_to=https%3A%2F%2Fekodi\.kr%2Fadmin%2F/);
  assert.match(adminCore, /loginLink\.href=route\?centralAdminAuthUrl\(route\):AUTH_URL/);
  assert.match(adminCore, /loginLink\.onclick=null/);
});

test('platform and tenant auth both consume a preopened Google bridge without showing the intermediate card', () => {
  assert.match(adminAuth, /const preopenedRequested=directEntry&&params\.get\('bridge'\)==='preopened'/);
  assert.match(adminAuth, /dataset\.adminDirectBridge='1'/);
  assert.match(adminAuth, /ekodi-google-origin-bridge-start/);
  assert.match(clientAuth, /const PREOPENED_BRIDGE=DIRECT_LOGIN&&params\.get\('bridge'\)==='preopened'/);
  assert.match(clientAuth, /dataset\.adminDirectBridge='1'/);
  assert.match(clientAuth, /ekodi-google-origin-bridge-ready/);
  assert.match(clientAuth, /ekodi-google-origin-bridge-start/);
  assert.match(clientAuth, /requestPreopenedGoogleCredential/);
  assert.match(authHtml, /html\[data-admin-direct-bridge="1"\] \.auth-card\{visibility:hidden/);
});

test('Google origin bridge keeps strict origin and account-selection safety', () => {
  assert.match(bridge, /targetOrigin:'https:\/\/ekodi\.kr'/);
  assert.match(bridge, /event\.origin!==TARGET_ORIGIN\|\|event\.source!==window\.opener/);
  assert.match(bridge, /clientId===EXPECTED_CLIENT/);
  assert.match(bridge, /auto_select:false/);
  assert.match(bridge, /google\.accounts\.id\.renderButton/);
  assert.match(bridge, /google\.accounts\.id\.prompt/);
  assert.match(bridge, /waitMode=params\.get\('wait'\)==='1'/);
});

test('single-handoff keeps the existing no-store auth asset contract', () => {
  assert.match(authRouter, /admin-auth\.js\?v=20260918-canonical-origin-2/);
  assert.match(authHtml, /auth-entry\.js\?v=20260923-space-admin-return-2/);
  assert.match(authEntry, /\.\/auth-router\.js\?v=20260923-space-admin-return-2/);
  assert.match(bridgeHtml, /google-origin-bridge\.js/);
});
