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
