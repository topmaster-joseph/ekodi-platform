import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [api, agent, admin, build, entry] = await Promise.all([
  readFile(new URL('../device-control.js', import.meta.url), 'utf8'),
  readFile(new URL('../tools/ekodi-device-agent/windows/ekodi-device-agent.ps1', import.meta.url), 'utf8'),
  readFile(new URL('../device-control-admin.js', import.meta.url), 'utf8'),
  readFile(new URL('../scripts/build.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../mission-control-entry-worker.js', import.meta.url), 'utf8'),
]);

test('Device Control routes are behind the mission control entry worker', () => {
  assert.match(entry, /handleDeviceControl/);
  assert.match(entry, /\/api\/control\/devices/);
  assert.match(entry, /\/api\/device-agent/);
});

test('device credentials are stored as hashes and enrollment is one-time', () => {
  assert.match(api, /token_hash TEXT NOT NULL UNIQUE/);
  assert.match(api, /code_hash TEXT NOT NULL UNIQUE/);
  assert.match(api, /used_at IS NULL AND expires_at > \?/);
  assert.match(api, /sha256\(token\)/);
  const registryInsert = api.match(/INSERT INTO device_registry[\s\S]*?\.run\(\);/)?.[0] || '';
  assert.ok(registryInsert, 'device registry insert must exist');
  assert.match(registryInsert, /tokenHash/);
  assert.doesNotMatch(registryInsert, /deviceToken/);
});

test('cloud commands are an explicit allowlist, never arbitrary shell', () => {
  for (const command of [
    'power.always_on',
    'power.presentation',
    'power.normal',
    'power.restore',
    'lock.resume_off',
    'lock.resume_on',
    'autologon.open',
  ]) assert.ok(api.includes(`'${command}'`), `missing allowlisted command ${command}`);
  assert.doesNotMatch(api, /shell\.exec|powershell\.exec|command\.script/);
  assert.doesNotMatch(agent, /Invoke-Expression|\biex\b/i);
  assert.match(agent, /arbitraryShell = \$false/);
});

test('autologon stays local and never sends a Windows password to EKODI', () => {
  assert.match(agent, /download\.sysinternals\.com\/files\/AutoLogon\.zip/);
  assert.match(agent, /Autologon 창을 로컬에서 열었습니다/);
  assert.doesNotMatch(agent, /DefaultPassword|DefaultUserName|AutoAdminLogon/);
  assert.doesNotMatch(admin, /password\s*:/i);
});

test('admin Device Control is bundled only into authenticated compact assets', () => {
  assert.match(build, /device-control-admin\.css/);
  assert.match(build, /device-control-admin\.js/);
  assert.match(build, /compact-control-center\.css/);
  assert.match(build, /compact-control-center\.js/);
  assert.doesNotMatch(build.match(/const assets = \[[\s\S]*?\];/)?.[0] || '', /device-control-admin/);
});

test('Windows agent preserves a power-plan backup before privileged changes', () => {
  assert.match(agent, /power-before-ekodi\.pow/);
  assert.match(agent, /powercfg\.exe \/export/);
  assert.match(agent, /Restore-PowerBackup/);
  assert.match(agent, /powercfg\.exe @Arguments/);
});
