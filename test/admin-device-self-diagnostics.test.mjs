import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const loader = fs.readFileSync(new URL('../admin-demand-loader.js', import.meta.url), 'utf8');
const source = fs.readFileSync(new URL('../device-browser-diagnostics.js', import.meta.url), 'utf8');
const style = fs.readFileSync(new URL('../device-browser-diagnostics.css', import.meta.url), 'utf8');
const build = fs.readFileSync(new URL('../scripts/build.mjs', import.meta.url), 'utf8');

test('admin device menu is localized and lazy-loads self diagnostics', () => {
  assert.match(loader, /label: '실행 인프라'/);
  assert.match(loader, /device-browser-diagnostics\.css/);
  assert.match(loader, /device-browser-diagnostics\.js/);
});

test('admin browser diagnostics is included in production dist assets', () => {
  assert.match(build, /'device-browser-diagnostics\.css'/);
  assert.match(build, /'device-browser-diagnostics\.js'/);
});

test('admin browser diagnostics stays local and browser-scoped', () => {
  assert.match(source, /현재 관리자 브라우저 진단/);
  assert.match(source, /서버로 업로드하지 않습니다/);
  assert.match(source, /CACHE_ALLOWLIST/);
  assert.match(source, /registration\.update\(\)/);
  assert.match(source, /window\.confirm/);
  assert.doesNotMatch(source, /localStorage\.clear\s*\(/);
  assert.doesNotMatch(source, /\/api\/control\/devices/);
  assert.doesNotMatch(source, /fetch\([^\n]*method\s*:\s*['\"]POST['\"]/);
});

test('admin browser diagnostics remains responsive', () => {
  assert.match(style, /@media\(max-width:720px\)/);
  assert.match(style, /@media\(max-width:460px\)/);
});

test('admin browser text, confirmation, and cleanup remain canonical and /admin scoped', () => {
  const retiredAdminHost = ['admin', 'ekodi', 'kr'].join('.');
  assert.ok(!source.includes(retiredAdminHost), 'Legacy admin host must not appear in active browser copy');
  assert.match(source, /ekodi\.kr\/admin의 관리자 전용 캐시/);
  assert.match(source, /이 브라우저의 ekodi\.kr\/admin 화면만 진단합니다/);
  assert.match(source, /if \(!isCanonicalAdmin\(\)\)/);
  assert.match(source, /registrations\.filter\(adminServiceWorker\)/);
  assert.match(source, /adminRegistrations\.map\(registration => registration\.update\(\)\)/);
  const cacheLine = source.match(/const CACHE_ALLOWLIST = [^\n]+/)?.[0];
  assert.ok(cacheLine, 'Admin CacheStorage allowlist should remain defined');
  const checkCache = vm.runInNewContext(cacheLine + '\n(name) => CACHE_ALLOWLIST.test(name)', {});
  assert.equal(checkCache('admin-ekodi-v1'), true);
  assert.equal(checkCache('ekodi-admin-v1'), true);
  assert.equal(checkCache('ekodi-site-public'), false);
  assert.equal(checkCache('ekodi'), false);
  const functions = [
    source.match(/function isCanonicalAdmin\(\) \{[^\n]+\}/)?.[0],
    source.match(/function adminServiceWorker\(registration\) \{[\s\S]*?\n  \}/)?.[0],
  ];
  assert.ok(functions.every(Boolean));
  const context = { URL, window: { location:new URL('https://ekodi.kr/admin/ops/devices') } };
  const adminPath = source.match(/const adminPath = [^\n]+/)?.[0];
  assert.ok(adminPath, 'Canonical Admin path guard must remain available');
  const scope = vm.runInNewContext([adminPath, ...functions].join('\n') + '\n({isCanonicalAdmin,adminServiceWorker})', context);
  assert.equal(scope.isCanonicalAdmin(), true);
  assert.equal(scope.adminServiceWorker({scope:'https://ekodi.kr/admin/'}), true);
  assert.equal(scope.adminServiceWorker({scope:'https://ekodi.kr/'}), false);
  assert.equal(scope.adminServiceWorker({scope:'https://ekodi.kr/ekodichurch/'}), false);
  assert.equal(scope.adminServiceWorker({scope:`https://${retiredAdminHost}/`}), false);
  context.window.location = new URL(`https://${retiredAdminHost}/admin/ops/devices`);
  assert.equal(scope.isCanonicalAdmin(), false);
});

test('device agent and admin AI registry use /admin, not retired Admin host as a destination', () => {
  const agent = fs.readFileSync(new URL('../tools/ekodi-device-agent/windows/ekodi-device-agent.ps1', import.meta.url), 'utf8');
  const chief = fs.readFileSync(new URL('../admin-lazy-features.js', import.meta.url), 'utf8');
  const retiredAdminHost = ['admin', 'ekodi', 'kr'].join('.');
  assert.match(agent, /name = 'EKODI Admin'; url = 'https:\/\/ekodi\.kr\/admin'/);
  assert.ok(!agent.includes(`name = 'EKODI Admin'; url = 'https://${retiredAdminHost}'`));
  assert.match(chief, /domain:'ekodi\.kr\/admin', name:'Control Center'/);
  assert.ok(!chief.includes(`domain:'${retiredAdminHost}', name:'Control Center'`));
});
