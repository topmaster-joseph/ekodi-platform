import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../'+path, import.meta.url), 'utf8');

test('platform overview uses the canonical Health panel with a compact Control Tower layer', async () => {
  const [health,tower,css] = await Promise.all([
    read('system-health-admin.js'),
    read('control-tower-admin.js'),
    read('control-tower-admin.css'),
  ]);
  assert.match(health, /dataset\.panel = `\$\{SECTION\} platform-overview`/);
  for (const label of ['종합','실행·배포','서비스','데이터·인증','트래픽·보안','비용·인프라']) assert.match(tower, new RegExp(label));
  assert.match(tower, /\/api\/control\/overview/);
  assert.match(tower, /api\.github\.com\/repos\/\$\{REPOSITORY\}\/actions\/runs/);
  assert.match(tower, /ekodiControlTowerDock/);
  assert.match(tower, /ct-health-detail/);
  assert.match(tower, /ct-overview-mode/);
  assert.match(css, /\.ct-overview-mode > \.ct-health-detail\{display:none!important\}/);
});

test('control tower keeps provider details secondary and does not create a parallel monitoring write path', async () => {
  const tower = await read('control-tower-admin.js');
  assert.doesNotMatch(tower, /method:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/);
  assert.doesNotMatch(tower, /row\.innerHTML/);
  assert.match(tower, /D1·Supabase·Storage/);
  assert.match(tower, /Supabase·Cloudflare·외부 API 연결 원본/);
});

test('authenticated admin shell keeps first path thin while convergence loads Control Tower assets', async () => {
  const [shell,convergence,build] = await Promise.all([
    read('admin-authenticated-shell.js'),
    read('admin-release-convergence.js'),
    read('scripts/build.mjs'),
  ]);
  assert.doesNotMatch(shell, /control-tower-admin\.(?:css|js)/);
  assert.match(convergence, /control-tower-admin\.css/);
  assert.match(convergence, /control-tower-admin\.js/);
  assert.match(build, /control-tower-admin\.css/);
  assert.match(build, /control-tower-admin\.js/);
});


test('control tower tabs use canonical detail paths and restore state from the route', async () => {
  const [tower,routes] = await Promise.all([
    read('control-tower-admin.js'),
    read('admin-canonical-routes.js'),
  ]);
  assert.match(routes, /pathFor\(section,detailSegments=\[\]\)/);
  assert.match(routes, /\/admin\/\$\{SECTION_GROUP\[normalized\]\}\/\$\{normalized\}/);
  assert.match(tower, /routeTab\(\)/);
  assert.match(tower, /navigationTarget\?\.\('platform-overview', location, details\)/);
  assert.match(tower, /history\.replaceState\(history\.state, '', target\)/);
  assert.match(tower, /window\.addEventListener\('popstate'/);
});

test('control tower exposes a compact right drawer without weakening the fixed sidebar contract', async () => {
  const [tower,css,workbench,e2e] = await Promise.all([
    read('control-tower-admin.js'),
    read('control-tower-admin.css'),
    read('admin-conversation-workbench.css'),
    read('scripts/verify-admin-production-ui-e2e.mjs'),
  ]);
  assert.match(tower, /function openDrawer/);
  assert.match(tower, /function closeDrawer/);
  assert.match(tower, /data-ct-drawer/);
  assert.match(css, /\.ct-drawer\{position:fixed/);
  assert.match(css, /width:min\(420px,92vw\)/);
  assert.match(workbench, /\.sidebar\{[\s\S]*position:fixed!important/);
  assert.match(e2e, /sidebarTop !== 0/);
  assert.match(e2e, /sidebarOverflowY !== 'hidden'/);
});
