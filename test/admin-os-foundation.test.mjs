import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Admin boot degradation preserves the base shell instead of replacing content', async () => {
  const shell = await read('admin-authenticated-shell.js');
  assert.match(shell, /ekodi-admin-runtime-degraded/);
  assert.match(shell, /preserving base shell/);
  assert.match(shell, /dataset\.ekodiAdminDegraded='navigation'/);
  assert.doesNotMatch(shell, /c\.innerHTML=.*관리자 메뉴 로딩 실패/);
});

test('Admin OS has a context selector that never grants authority', async () => {
  const runtime = await read('admin-menu-runtime.js');
  assert.match(runtime, /CONTEXT_KEY = 'ekodi-admin-context-v1'/);
  assert.match(runtime, /\/api\/customers\/directory/);
  assert.match(runtime, /ecosystem-services\.json/);
  assert.match(runtime, /ekodi-admin-context-changed/);
  assert.match(runtime, /전환은 권한을 추가하지 않습니다/);
  assert.match(runtime, /authority:currentSession\?\.authority \|\| null/);
  assert.match(runtime, /EKODIAdminContext/);
});

test('privileged admin writes reauthenticate in place and retry the original action', async () => {
  const runtime = await read('admin-menu-runtime.js');
  assert.match(runtime, /error\?\.code !== 'ELEVATION_REQUIRED'/);
  assert.match(runtime, /await requestElevation\(\)/);
  assert.match(runtime, /return operation\(\)/);
  assert.match(runtime, /\/api\/admin-access\/elevation/);
  assert.match(runtime, /google\.accounts\.id\.initialize/);
  assert.match(runtime, /15분 동안 보호된 관리자 작업/);
  assert.match(runtime, /withPrivilege\(\(\) => api/);
});

test('server side administrator mutation is capability and elevation gated', async () => {
  const auth = await read('admin-google-auth.js');
  assert.match(auth, /requireCapability\(request, env, 'admin:accounts\.write'\)/);
  assert.match(auth, /admin_privileged_sessions/);
  assert.match(auth, /PRIVILEGED_MINUTES = 15/);
  assert.match(auth, /session\.elevated/);
  assert.match(auth, /ELEVATION_ACCOUNT_MISMATCH/);
  assert.match(auth, /ELEVATION_REQUIRED/);
});
