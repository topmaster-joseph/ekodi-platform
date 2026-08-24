import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const source = async path => readFile(new URL(path, root), 'utf8');

test('super administrator management is apex-only and built into the shared site', async () => {
  const [page, client, worker, build, handoff] = await Promise.all([
    source('admins.html'),
    source('admin-accounts.js'),
    source('site-worker.js'),
    source('scripts/build.mjs'),
    source('admin-central-handoff.js'),
  ]);

  assert.match(page, /관리자 계정·권한/);
  assert.match(page, /admin-accounts\.css/);
  assert.match(page, /admin-accounts\.js/);
  assert.match(build, /'admins\.html'/);
  assert.match(build, /'admin-accounts\.css'/);
  assert.match(build, /'admin-accounts\.js'/);

  assert.match(worker, /const ADMIN_APEX_HOST = 'admin\.ekodi\.kr'/);
  assert.match(worker, /ADMIN_ACCOUNTS_PATHS/);
  assert.match(worker, /host !== ADMIN_APEX_HOST/);
  assert.match(worker, /'admin-accounts-denied'/);
  assert.match(worker, /assetRequest\(request, '\/admins'\)/);

  assert.match(handoff, /session\?\.role === 'super_admin'/);
  assert.match(handoff, /location\.hostname\.toLowerCase\(\) === 'admin\.ekodi\.kr'/);
  assert.match(handoff, /link\.href = '\/admins'/);
  assert.match(handoff, /관리자 계정·권한/);

  assert.match(client, /location\.hostname!=='admin\.ekodi\.kr'/);
  assert.match(client, /session\.role!=='super_admin'/);
  assert.match(client, /\/api\/admin-access\/google-accounts/);
});

test('backend preserves last super admin and only super admins can manage allowlist', async () => {
  const backend = await source('admin-google-auth.js');
  assert.match(backend, /async function requireSuperAdmin/);
  assert.match(backend, /admin\.role !== 'super_admin'/);
  assert.match(backend, /role = 'super_admin' AND status = 'active'/);
  assert.match(backend, /활성 최고관리자는 최소 1명 이상 유지해야 합니다/);
  assert.match(backend, /admin_google\.allow/);
  assert.match(backend, /admin_google\.update/);
});

test('viewer is read-only on EKODI Core control plane and secrets stay super-admin-only', async () => {
  const entry = await source('mission-control-entry-worker.js');
  assert.match(entry, /path\.startsWith\('\/api\/control\/'\)/);
  assert.match(entry, /role === 'viewer'/);
  assert.match(entry, /VIEWER_READ_ONLY/);
  assert.match(entry, /path\.startsWith\('\/api\/control\/secrets'\)/);
  assert.match(entry, /role !== 'super_admin'/);
  assert.match(entry, /SUPER_ADMIN_REQUIRED/);
});
