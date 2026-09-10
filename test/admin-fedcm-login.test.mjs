import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const adminAuthUrl = new URL('../auth-site/admin-auth.js', import.meta.url);
const bridgeUrl = new URL('../auth-site/google-origin-bridge.js', import.meta.url);
const authRouterUrl = new URL('../auth-site/auth-router.js', import.meta.url);
const handoffUrl = new URL('../admin-central-handoff.js', import.meta.url);
const adminAuth = await readFile(adminAuthUrl, 'utf8');
const bridge = await readFile(bridgeUrl, 'utf8');
const authRouter = await readFile(authRouterUrl, 'utf8');
const handoff = await readFile(handoffUrl, 'utf8');

test('admin Google auth and origin bridge modules remain syntactically valid', () => {
  for (const file of [adminAuthUrl, bridgeUrl, authRouterUrl, handoffUrl]) {
    const result = spawnSync(process.execPath, ['--check', fileURLToPath(file)], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  }
});

test('Google popup UX runs only on the approved legacy auth origin bridge', () => {
  assert.match(adminAuth, /GOOGLE_BRIDGE_ORIGIN='https:\/\/auth\.ekodi\.kr'/);
  assert.match(adminAuth, /window\.open\(target\.href,'ekodi_google_origin_bridge'/);
  assert.doesNotMatch(adminAuth, /google\.accounts\.id\.initialize/);
  assert.match(bridge, /use_fedcm_for_button:false/);
  assert.match(bridge, /button_auto_select:false/);
  assert.match(bridge, /ux_mode:'popup'/);
  assert.match(bridge, /google\.accounts\.id\.renderButton/);
  assert.doesNotMatch(bridge, /use_fedcm_for_prompt/);
});
test('admin direct entry uses the bridge and preserves manual recovery', () => {
  assert.match(handoff, /site=admin&direct=1&return_to=/);
  assert.match(adminAuth, /const directEntry=params\.get\('direct'\)==='1'/);
  assert.match(adminAuth, /renderOriginBridgeButton\(host,config,challenge\)/);
  assert.match(adminAuth, /adminDirectBridge='prompt'/);
  assert.match(adminAuth, /GOOGLE_POPUP_BLOCKED/);
  assert.match(adminAuth, /GOOGLE_BRIDGE_CLOSED/);
  assert.match(adminAuth, /GOOGLE_BRIDGE_TIMEOUT/);
});

test('admin auth preserves allowlist and expired-challenge recovery', () => {
  assert.match(adminAuth, /GOOGLE_ACCOUNT_NOT_ALLOWED/);
  assert.match(adminAuth, /\/만료\|이미 사용\//);
  assert.match(adminAuth, /setTimeout\(prepare,350\)/);
  assert.match(adminAuth, /event\.origin!==GOOGLE_BRIDGE_ORIGIN/);
  assert.match(adminAuth, /event\.source!==popup/);
  assert.match(authRouter, /admin-auth\.js\?v=20260909-origin-bridge-1/);
});
