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

test('PC auto sign-in is an explicit platform-only Execution Infrastructure detail', () => {
  const infra = ADMIN_MENUS.find(menu => menu.id === 'infra');
  assert.deepEqual(infra.sections, ['devices', 'device-autologon', 'pos-agent']);
  assert.equal(getAdminMenuForSection('device-autologon').id, 'infra');
  assert.deepEqual(adminMenuTabs('device-autologon'), infra.sections);
  const item = getAdminMenuItem('device-autologon');
  assert.equal(item.labels.ko, 'PC 자동 로그인');
  assert.equal(item.delegateSection, 'devices');
  assert.equal(item.superAdminOnly, true);
  assert.equal(item.risk, 'high');
  assert.equal(item.governance.globalPolicyMutation, 'super_admin');
});

test('canonical URL is bookmarkable and keeps its section across navigation', () => {
  const url = new URL('https://ekodi.kr/admin/ops/device-autologon');
  const context = { window: { location:url, matchMedia:()=>({matches:false}) }, URL, URLSearchParams };
  runInNewContext(routesSource, context);
  const routes = context.window.EKODIAdminRoutes;
  assert.equal(routes.sectionFromLocation(url), 'device-autologon');
  assert.equal(routes.pathFor('device-autologon'), url.pathname);
  assert.equal(routes.navigationTarget('device-autologon', url), url.pathname);
});

test('focused PC page integrates into the existing authenticated device panel', () => {
  assert.match(admin, /AUTOLOGON_URL = '\/admin\/ops\/device-autologon'/);
  assert.match(admin, /panel\.dataset\.panel = 'devices device-autologon'/);
  assert.match(admin, /panels\.activate\(autologonRoute\(\) \? 'device-autologon' : 'devices'\)/);
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
  assert.match(server, /'autologon\.open': \{ risk: 'maintain', confirm: true \}/);
  assert.match(agent, /function Open-AutologonManager/);
  assert.match(agent, /download\.sysinternals\.com\/files\/AutoLogon\.zip/);
  assert.match(agent, /Start-Process -FilePath \$binary/);
});
