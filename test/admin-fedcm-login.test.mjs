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

test('admin Google button uses explicit popup UX instead of browser-controlled FedCM button UX', () => {
  assert.match(adminAuth, /use_fedcm_for_button:false/);
  assert.match(adminAuth, /button_auto_select:false/);
  assert.match(adminAuth, /ux_mode:'popup'/);
  assert.match(adminAuth, /disableAutoSelect/);
  assert.doesNotMatch(adminAuth, /supportsFedCmButton/);
  assert.doesNotMatch(adminAuth, /use_fedcm_for_prompt/);
});

test('admin direct entry automatically opens Google account selection and keeps a manual fallback', () => {
  assert.match(handoff, /site=admin&direct=1&return_to=/);
  assert.match(adminAuth, /const directEntry=params\.get\('direct'\)==='1'/);
  assert.match(adminAuth, /window\.google\.accounts\.id\.prompt\(/);
  assert.match(adminAuth, /revealDirectFallback/);
  assert.match(adminAuth, /clearDirectFallback/);
  assert.match(adminAuth, /moment\?\.isDisplayed\?\.\(\)===true/);
  assert.match(adminAuth, /if\(displayed\)\{clearDirectFallback\(\);return\}/);
  assert.match(adminAuth, /adminDirectBridge='fallback'/);
  assert.match(adminAuth, /adminDirectBridge='prompt'/);
  assert.match(adminAuth, /auto_select:false/);
});

test('admin auth recovers from expired challenges and shows allowlist failures clearly', () => {
  assert.match(adminAuth, /GOOGLE_ACCOUNT_NOT_ALLOWED/);
  assert.match(adminAuth, /expired_challenge/);
  assert.match(adminAuth, /setTimeout\(prepare,350\)/);
  assert.match(authRouter, /admin-auth\.js\?v=20260904-direct-bridge-1/);
});
