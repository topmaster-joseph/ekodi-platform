import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const adminAuthUrl = new URL('../auth-site/admin-auth.js', import.meta.url);
const authRouterUrl = new URL('../auth-site/auth-router.js', import.meta.url);
const adminAuth = await readFile(adminAuthUrl, 'utf8');
const authRouter = await readFile(authRouterUrl, 'utf8');

test('admin Google auth modules remain syntactically valid', () => {
  for (const file of [adminAuthUrl, authRouterUrl]) {
    const result = spawnSync(process.execPath, ['--check', fileURLToPath(file)], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  }
});

test('admin Google button uses the current FedCM button flow', () => {
  assert.match(adminAuth, /use_fedcm_for_button:\s*true/);
  assert.match(adminAuth, /button_auto_select:\s*false/);
  assert.doesNotMatch(adminAuth, /use_fedcm_for_prompt/);
  assert.match(adminAuth, /disableAutoSelect/);
});

test('admin auth recovers from expired challenges and shows allowlist failures clearly', () => {
  assert.match(adminAuth, /GOOGLE_ACCOUNT_NOT_ALLOWED/);
  assert.match(adminAuth, /expired_challenge/);
  assert.match(adminAuth, /setTimeout\(prepare,\s*350\)/);
  assert.match(authRouter, /admin-auth\.js\?v=20260816-fedcm-button-1/);
});
