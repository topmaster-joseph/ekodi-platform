import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('login provider policy defaults to Google single sign-in', async () => {
  const source = await read('auth-provider-policy.js');
  assert.match(source, /multi_login_enabled INTEGER NOT NULL DEFAULT 0/);
  assert.match(source, /default_provider TEXT NOT NULL DEFAULT 'google'/);
  assert.match(source, /provider\.id === 'google' \? 1 : 0/);
  assert.match(source, /provider\.configuredByDefault \? 1 : 0/);
});

test('auth worker preserves the existing core and intercepts provider policy routes', async () => {
  const source = await read('auth-worker.js');
  assert.match(source, /import authCore from '\.\/auth-worker-core\.js'/);
  assert.match(source, /export \* from '\.\/auth-worker-core\.js'/);
  assert.match(source, /handleAuthProviderPolicy/);
});

test('provider policy exposes public routing state and super-admin management only', async () => {
  const source = await read('auth-provider-policy.js');
  assert.match(source, /\/api\/auth\/providers/);
  assert.match(source, /\/api\/admin\/auth\/providers/);
  assert.match(source, /session\.role !== 'super_admin'/);
  assert.match(source, /PROVIDER_NOT_CONFIGURED/);
  assert.match(source, /최소 하나의 로그인 방식을 활성화해야 합니다/);
});

test('admin asset preserves maintenance controls and adds login provider settings', async () => {
  const [ui, shell, build] = await Promise.all([
    read('admin-public-site-controls.js'),
    read('admin-authenticated-shell.js'),
    read('scripts/build.mjs')
  ]);
  assert.match(ui, /임시페이지 설정/);
  assert.match(ui, /멀티 로그인 사용/);
  assert.match(ui, /기본 로그인 방식/);
  assert.match(ui, /현재 기본값은 Google 단일 로그인/);
  assert.match(ui, /\/api\/admin\/auth\/providers/);
  assert.match(shell, /admin-public-site-controls\.js/);
  assert.match(build, /admin-public-site-controls\.js/);
});
