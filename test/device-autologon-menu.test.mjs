import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import {
  ADMIN_MENUS, getAdminMenuItem, getAdminMenuForSection, adminMenuTabs,
} from '../admin-menu-registry.js';

const [routesSource, admin, agent, server, css] = await Promise.all([
  readFile(new URL('../admin-canonical-routes.js', import.meta.url), 'utf8'),
  readFile(new URL('../device-control-admin.js', import.meta.url), 'utf8'),
  readFile(new URL('../tools/ekodi-device-agent/windows/ekodi-device-agent.ps1', import.meta.url), 'utf8'),
  readFile(new URL('../device-control.js', import.meta.url), 'utf8'),
  readFile(new URL('../device-control-admin.css', import.meta.url), 'utf8'),
]);

test('PC auto sign-in reuses the orchestrator-classified Device Control menu and does not add an unclassified role', () => {
  const infra = ADMIN_MENUS.find(menu => menu.id === 'infra');
  assert.deepEqual(infra.sections, ['devices', 'pos-agent']);
  assert.equal(getAdminMenuForSection('devices').id, 'infra');
  assert.deepEqual(adminMenuTabs('devices'), infra.sections);
  const item = getAdminMenuItem('devices');
  assert.equal(item.governance.globalPolicyMutation, 'super_admin');
  assert.equal(item.risk, 'high');
  assert.equal(getAdminMenuItem('device-autologon'), null);
});

test('canonical URL is bookmarkable and keeps its section across navigation', () => {
  const url = new URL('https://ekodi.kr/admin/ops/devices/autologon');
  const context = { window: { location:url, matchMedia:()=>({matches:false}) }, URL, URLSearchParams };
  runInNewContext(routesSource, context);
  const routes = context.window.EKODIAdminRoutes;
  assert.equal(routes.sectionFromLocation(url), 'devices');
  assert.equal(routes.pathFor('devices', ['autologon']), url.pathname);
  assert.equal(routes.navigationTarget('devices', url), url.pathname);
});

test('focused PC page integrates into the existing authenticated device panel', () => {
  assert.match(admin, /AUTOLOGON_URL = '\/admin\/ops\/devices\/autologon'/);
  assert.match(admin, /panel\.dataset\.panel = 'devices'/);
  assert.match(admin, /panels\.activate\('devices'\)/);
  assert.match(admin, /const focusedPcMode = performanceMode \|\| autologonRoute\(\)/);
  assert.match(admin, /focusedPcMode && \(device\.management\?\.type !== 'pc'/);
  assert.match(admin, /wrapper\.open = windowsPerformanceRoute\(\) \|\| autologonRoute\(\)/);
  assert.match(admin, /autologonRoute\(\) && autologon/);
  assert.match(admin, /card\.append\(head, meta, autologon\)/);
  assert.match(css, /EKODI-PC-AUTOLOGON-MENU-001/);
  assert.match(css, /@media\(max-width:640px\).*device-autologon-panel/s);
});

test('remote command opens local Microsoft UI only, not an automatic configuration change', () => {
  const panel = admin.match(/  function autologonPanel\(device\) \{[\s\S]*?\n  \}\n\n  \/\/ EKODI-WINDOWS-PERFORMANCE-001/)?.[0] || '';
  assert.ok(panel, 'on-demand autologon panel is present');
  assert.match(panel, /device\.status === 'online' && device\.management\?\.remoteCommandLevel === 'managed'/);
  assert.match(panel, /makeActionButton\(device, 'autologon\.open', '이 PC에서 Autologon 열기', 'primary', \{\}, !available\)/);
  assert.match(panel, /device\.capabilities\?\.posAgent === true/);
  assert.match(panel, /official\.href = 'https:\/\/learn\.microsoft\.com\/sysinternals\/downloads\/autologon'/);
  assert.match(panel, /설정 완료 여부와는 별개/);
  assert.doesNotMatch(panel, /DefaultPassword|password:|input type="password"|localStorage|sessionStorage/);
  assert.match(admin, /'autologon\.open': '자동로그인 암호는 클라우드에서 받지 않습니다/);
  assert.match(server, /'autologon\.open': \{ risk: 'privileged', confirm: true \}/);
  assert.match(agent, /function Open-AutologonManager/);
  assert.match(agent, /download\.sysinternals\.com\/files\/AutoLogon\.zip/);
  assert.match(agent, /Start-Process -FilePath \$binary/);
});
