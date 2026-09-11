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

test('central admin login pre-opens the approved Google origin bridge from the first user gesture', () => {
  assert.match(adminCore, /open\('https:\/\/auth\.ekodi\.kr\/google-origin-bridge\?wait=1','ekodi_google_origin_bridge','popup'\)/);
  assert.match(adminCore, /e\.preventDefault\(\)/);
  assert.match(adminCore, /location\.href=loginLink\.href\+'&bridge=preopened'/);
});

test('admin auth accepts only the expected bridge origin and hands the challenge to the pre-opened bridge', () => {
  assert.match(adminAuth, /const preopenedRequested=directEntry&&params\.get\('bridge'\)==='preopened'/);
  assert.match(adminAuth, /event\.origin!==GOOGLE_BRIDGE_ORIGIN/);
  assert.match(adminAuth, /data\.type!=='ekodi-google-origin-bridge-ready'/);
  assert.match(adminAuth, /type:'ekodi-google-origin-bridge-start'/);
  assert.match(adminAuth, /nonce:challenge\.nonce/);
  assert.match(adminAuth, /renderOriginBridgeButton\(host,config,challenge\)/);
});

test('Google origin bridge keeps strict origin and account-selection safety while auto-prompting with fallback', () => {
  assert.match(bridge, /const TARGET_ORIGIN='https:\/\/ekodi\.kr'/);
  assert.match(bridge, /event\.origin!==TARGET_ORIGIN\|\|event\.source!==window\.opener/);
  assert.match(bridge, /clientId===EXPECTED_CLIENT/);
  assert.match(bridge, /auto_select:false/);
  assert.match(bridge, /google\.accounts\.id\.renderButton/);
  assert.match(bridge, /google\.accounts\.id\.prompt/);
  assert.match(bridge, /type:'ekodi-google-origin-bridge-ready'/);
});

test('single-handoff keeps the existing no-store auth asset contract', () => {
  assert.match(authRouter, /admin-auth\.js\?v=20260909-origin-bridge-1/);
  assert.match(authHtml, /auth-router\.js\?v=20260904-direct-login-1/);
  assert.match(bridgeHtml, /google-origin-bridge\.js/);
});
