import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = name => readFile(new URL(`../${name}`, import.meta.url), 'utf8');
const [campus, css, labels, shell, registry, maintenance, map, common, aiops, lazy] = await Promise.all([
  read('campus-actions.js'), read('campus-actions.css'), read('admin-surface-labels.js'), read('admin-shell.html'),
  read('admin-menu-registry.js'), read('admin-public-site-controls.js'), read('system-map-admin.js'),
  read('common-services-admin.js'), read('ai-ops-admin.js'), read('admin-lazy-features.js'),
]);

test('Site Management promotes classification to a top tab strip with persistent filtering', () => {
  assert.match(campus, /className = 'campus-group-tabs'/);
  assert.match(campus, /role', 'tablist'/);
  assert.match(campus, /data-campus-group-tab/);
  assert.match(campus, /site_group/);
  assert.match(campus, /applyGroupFilter/);
  assert.match(css, /\.campus-group-tab/);
});

test('Admin uses canonical human-facing root paths while preserving runtime keys internally', () => {
  for (const path of ['ekodi.kr/admin','ekodi.kr/auth','ekodi.kr/my','ekodi.kr/ekodichurch','ekodi.kr/ekodibiz','ekodi.kr/jadam','ekodi.kr/pizzamaru','ekodi.kr/yogurt']) assert.match(labels, new RegExp(path.replaceAll('/','\\/')));
  assert.match(labels, /에코디 내부 서비스 실행 경계/);
  assert.match(shell, /admin-surface-labels\.js/);
  assert.match(campus, /EKODIAdminSurfaceLabels/);
  assert.match(aiops, /displayAddress/);
  assert.match(lazy, /displayAddress/);
});
test('Maintenance controls are clearly distinct from the canonical Site Management catalog', () => {
  assert.match(registry, /공개·점검 전환/);
  assert.match(maintenance, /사이트 목록을 다시 만들지 않고/);
  assert.match(maintenance, /공개 주소의 정상 공개·점검 모드만 전환/);
  assert.match(maintenance, /surfaceInfo/);
  assert.doesNotMatch(maintenance, /\$\{site\.domain\}/);
  assert.doesNotMatch(maintenance, /\$\{result\.site\.domain\}/);
});

test('Architecture and common-service copy no longer presents legacy admin/auth/my subdomains as user addresses', () => {
  assert.match(map, /ekodi\.kr\/auth/);
  assert.match(map, /ekodi\.kr\/my/);
  assert.match(map, /ekodi\.kr\/admin/);
  assert.doesNotMatch(map, /<strong>auth\.ekodi\.kr<\/strong>|<strong>my\.ekodi\.kr<\/strong>|<strong>admin\.ekodi\.kr<\/strong>/);
  assert.match(common, /<strong>ekodi\.kr\/admin<\/strong>/);
  assert.match(common, /내부 서비스 엔진/);
  assert.match(common, /AI Core는 내부 실행 엔진/);
});
