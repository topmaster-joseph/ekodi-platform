import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const adminAuthUrl = new URL('../auth-site/admin-auth.js', import.meta.url);
const authRouterUrl = new URL('../auth-site/auth-router.js', import.meta.url);
const handoffUrl = new URL('../admin-central-handoff.js', import.meta.url);
const adminAuth = await readFile(adminAuthUrl, 'utf8');
const authRouter = await readFile(authRouterUrl, 'utf8');
const handoff = await readFile(handoffUrl, 'utf8');

test('admin Google auth modules remain syntactically valid', () => {
  for (const file of [adminAuthUrl, authRouterUrl, handoffUrl]) {
    const result = spawnSync(process.execPath, ['--check', fileURLToPath(file)], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  }
});

test('admin Google button enables FedCM only on supported browser versions', () => {
  assert.match(adminAuth, /function supportsFedCmButton\(\)/);
  assert.match(adminAuth, /isEmbeddedWebView\|\|isIos/);
  assert.match(adminAuth, /return isAndroid\?major>=128:major>=125/);
  assert.match(adminAuth, /use_fedcm_for_button:supportsFedCmButton\(\)/);
  assert.match(adminAuth, /button_auto_select:false/);
  assert.doesNotMatch(adminAuth, /use_fedcm_for_prompt/);
  assert.match(adminAuth, /disableAutoSelect/);
});

test('admin direct entry opens the Google account chooser without a second auth-page click', () => {
  assert.match(handoff, /site=admin&direct=1&return_to=/);
  assert.match(adminAuth, /const directEntry=params\.get\('direct'\)==='1'/);
  assert.match(adminAuth, /if\(directEntry\)/);
  assert.match(adminAuth, /window\.google\.accounts\.id\.prompt\(\)/);
  assert.match(adminAuth, /auto_select:false/);
});

test('admin auth recovers from expired challenges and shows allowlist failures clearly', () => {
  assert.match(adminAuth, /GOOGLE_ACCOUNT_NOT_ALLOWED/);
  assert.match(adminAuth, /expired_challenge/);
  assert.match(adminAuth, /setTimeout\(prepare,350\)/);
  assert.match(authRouter, /admin-auth\.js\?v=20260823-mobile-handoff-1/);
});
