import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { summarizeCommandResult } from '../device-control.js';
import { getAdminMenuItem, getAdminMenuForSection } from '../admin-menu-registry.js';

const [routesSource, admin, api, agent] = await Promise.all([
  readFile(new URL('../admin-canonical-routes.js', import.meta.url), 'utf8'),
  readFile(new URL('../device-control-admin.js', import.meta.url), 'utf8'),
  readFile(new URL('../device-control.js', import.meta.url), 'utf8'),
  readFile(new URL('../tools/ekodi-device-agent/windows/ekodi-device-agent.ps1', import.meta.url), 'utf8'),
]);

test('file extensions remain in existing platform-super-admin execution infrastructure menu', () => {
  assert.equal(getAdminMenuForSection('devices').id, 'infra');
  assert.equal(getAdminMenuItem('devices').governance.globalPolicyMutation, 'super_admin');
  assert.equal(getAdminMenuItem('file-extensions'), null);
  const url = new URL('https://ekodi.kr/admin/ops/devices/file-extensions');
  const context = { window:{ location:url, matchMedia:()=>({matches:false}) }, URL, URLSearchParams };
  runInNewContext(routesSource, context);
  assert.equal(context.window.EKODIAdminRoutes.sectionFromLocation(url), 'devices');
  assert.equal(context.window.EKODIAdminRoutes.navigationTarget('devices', url), url.pathname);
  assert.equal(context.window.EKODIAdminRoutes.pathFor('devices', ['file-extensions']), url.pathname);
});

test('browser controls run only via confirmed allowlisted Device Control commands on online PC', () => {
  assert.match(admin, /FILE_EXTENSIONS_URL = '\/admin\/ops\/devices\/file-extensions'/);
  assert.match(admin, /fileExtensionsRoute\(\)/);
  assert.match(admin, /dataset\.fileExtensionsPanel = 'v1'/);
  assert.match(admin, /device\.status === 'online' && device\.management\?\.remoteCommandLevel === 'managed'/);
  assert.match(admin, /capability\(device, 'fileExtensions'\)/);
  assert.match(admin, /file_extensions\.status', '현재 상태 확인'/);
  assert.match(admin, /file_extensions\.show', '파일 확장자 표시'/);
  assert.match(admin, /file_extensions\.restore', '원래 설정 복원'/);
  assert.match(admin, /confirmed: Boolean\(message\)/);
  assert.match(api, /'file_extensions\.status': \{ risk: 'observe', superAdmin: true \}/);
  assert.match(api, /'file_extensions\.show': \{ risk: 'maintain', confirm: true, superAdmin: true \}/);
  assert.match(api, /'file_extensions\.restore': \{ risk: 'maintain', confirm: true, superAdmin: true \}/);
  assert.match(api, /FILE_EXTENSIONS_AGENT_UPGRADE_REQUIRED/);
  assert.match(api, /FILE_EXTENSIONS_DEVICE_OFFLINE/);
  assert.match(api, /DEVICE_COMMAND_SUPER_ADMIN_REQUIRED/);
  assert.match(api, /commandType\.startsWith\('file_extensions\.'\)/);
  assert.match(api, /DEVICE_JOB_NOT_ALLOWED/);
  assert.doesNotMatch(admin, /reg add|PowerShell -Command|Invoke-Expression/i);
});

test('Windows Agent updates its own HKCU only, preserves a user-scoped original and verifies result', () => {
  assert.match(agent, /function Assert-FileExtensionsUser \{/);
  assert.match(agent, /S-1-5-18/);
  assert.match(agent, /HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced/);
  assert.match(agent, /GetValueKind\('HideFileExt'\)/);
  assert.match(agent, /function Get-FileExtensionsState \{/);
  assert.match(agent, /function Set-FileExtensionsVisible \{/);
  assert.match(agent, /function Restore-FileExtensionsVisibility \{/);
  assert.match(agent, /New-ItemProperty -Path \$key -Name 'HideFileExt' -Value 0 -PropertyType DWord -Force/);
  assert.match(agent, /file_extensions_backup_account_mismatch/);
  assert.match(agent, /file_extensions_apply_verification_failed/);
  assert.match(agent, /file_extensions_restore_verification_failed/);
  assert.match(agent, /file_extensions_command_expired/);
  for (const command of ['file_extensions.status','file_extensions.show','file_extensions.restore']) {
    assert.ok(agent.includes(`'${command}'`), `Agent missing ${command}`);
  }
  assert.doesNotMatch(agent, /Invoke-Expression/);
});

test('command receipt projection is bounded to visibility, restore and time; no SID or registry path', () => {
  const result = summarizeCommandResult({
    fileExtensions:{ visibility:'shown', canRestore:true, checkedAt:'2026-11-08T00:00:00Z', sid:'S-1-5-21-secret', key:'HKCU:\\Private', arbitrary:'no' },
    secret:'do-not-send',
  }, 'file_extensions.show');
  assert.deepEqual(result.fileExtensions, {visibility:'shown', canRestore:true, checkedAt:'2026-11-08T00:00:00Z'});
  assert.equal(JSON.stringify(result).includes('secret'),false);
  assert.equal(JSON.stringify(result).includes('HKCU'),false);
  assert.equal(summarizeCommandResult({fileExtensions:{visibility:'bogus'}},'file_extensions.status').fileExtensions.visibility,'unknown');
});
