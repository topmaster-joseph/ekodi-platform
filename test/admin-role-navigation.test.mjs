import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const policy = JSON.parse(await readFile(new URL('../config/admin-role-navigation.json', import.meta.url), 'utf8'));
const registry = await readFile(new URL('../admin-menu-registry.js', import.meta.url), 'utf8');
const sidebar = await readFile(new URL('../admin-sidebar.js', import.meta.url), 'utf8');

test('platform super admin owns explicit platform control navigation', () => {
  const profile = policy.profiles['platform-super-admin'];
  assert.equal(profile.surface, '/admin');
  assert.equal(profile.maySeeControlPlane, true);
  assert.deepEqual(profile.groups.map(group => group.id), [
    'summary','sites','people','services','content','status','settings-records',
  ]);
  assert.deepEqual(profile.groups.map(group => group.labelKo), [
    '플랫폼 전체현황','사이트·브랜드','사용자·관리자·권한','서비스·AI','콘텐츠·행사·소통','운영·배포·장애','설정·보안·감사',
  ]);
  for (const label of profile.groups.map(group => group.labelKo)) assert.match(registry, new RegExp(label));
  assert.match(sidebar, /isPlatformSuperAdminSurface/);
  assert.match(sidebar, /renderSidebarDetails\(nav, globals, group, displayedSection \|\| section, locale\)/);
});

test('delegated managers use site-owned task menus rather than a reduced platform menu', () => {
  const profile = policy.profiles['delegated-manager'];
  assert.equal(profile.surfacePattern, '/{site-or-workspace}/admin');
  assert.equal(profile.maySeeControlPlane, false);
  assert.ok(profile.mustNotShow.includes('global deployment'));
  assert.ok(profile.mustNotShow.includes('global AI policy'));
  assert.ok(profile.mustNotShow.includes('platform-wide administrators'));
  assert.deepEqual(policy.domainProjections.workspace['delegated-manager'], ['홈','소통·홍보','운영·재무','사이트·권한']);
  assert.deepEqual(policy.domainProjections.store['delegated-manager'], ['현황','주문·매출','메뉴·재고','고객·리뷰','홍보·채널','운영·설정']);
  assert.deepEqual(policy.domainProjections.church['delegated-manager'], ['현황','교인·돌봄','예배·사역','기록·AI','사이트·권한']);
});

test('local operators see only high-frequency domain tasks', () => {
  const profile = policy.profiles['local-operator'];
  assert.equal(profile.maySeeControlPlane, false);
  assert.equal(profile.configurationLast, true);
  for (const forbidden of ['platform settings','administrator management','security policy','deployment controls','cross-tenant data']) {
    assert.ok(profile.mustNotShow.includes(forbidden));
  }
  assert.deepEqual(policy.domainProjections.store['local-operator'], ['오늘 주문','메뉴·품절','고객·리뷰','홍보·채널']);
  assert.deepEqual(policy.domainProjections.church['local-operator'], ['오늘 일정','출석·교인','예배·사역','신청·연락']);
});

test('role projection never changes authority source of truth', () => {
  assert.equal(policy.authorityModel, 'Person + Workspace + Role + Capability');
  assert.match(policy.principles.join(' '), /never widens authorization/i);
});
