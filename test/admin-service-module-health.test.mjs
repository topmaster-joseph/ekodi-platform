import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('central admin exposes a unique common/professional module health route', () => {
  const routes = read('admin-canonical-routes.js');
  const menu = read('admin-menu-registry.js');
  assert.match(routes, /'service-modules':'services'/);
  assert.match(menu, /id: 'service-modules'.*delegateSection: 'common-services'.*internal: true/);
});

test('module health route excludes core and selects common plus professional modules', () => {
  const registry = read('common-services-admin.js');
  assert.match(registry, /'service-modules':'service-modules'/);
  assert.match(registry, /state\.category==='service-modules'.*item\.category==='common'\|\|item\.category==='professional'/);
  assert.match(registry, /function activationState\(service\)/);
  assert.match(registry, /활성화 \$\{esc\(a\.label\)\} · 헬스 \$\{esc\(s\.label\)\}/);
});

test('central admin sidebar footer links to the module health registry', () => {
  const shell = read('shell/admin-ui-shell.js');
  assert.match(shell, /https:\/\/ekodi\.kr\/admin\/services\/service-modules/);
  assert.match(shell, /공통·전문 모듈 점검/);
  assert.match(shell, /data-ekodi-service-module-health/);
});
