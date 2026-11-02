import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  ADMIN_MENU_GROUPS,
  ADMIN_MENUS,
  ADMIN_MENU_REGISTRY,
  adminMenusForGroup,
  adminMenuTabs,
  getAdminMenuForSection,
  adminMenuOrder,
  adminMenuCategoryOrder,
  getAdminMenuCategory,
  getAdminMenuCategoryLabel,
  getAdminMenuGroupDefault,
  getAdminMenuGroupForSection,
  getAdminMenuLabel,
  normalizeAdminLocale,
} from '../admin-menu-registry.js';

const WORK_AREAS = ['home', 'sites', 'ai', 'services', 'finance', 'ops', 'settings', 'accounts'];

test('admin navigation has eight nonoverlapping platform-only EKODI areas', () => {
  assert.deepEqual(ADMIN_MENU_GROUPS.map(group => group.id), WORK_AREAS);
  assert.deepEqual(ADMIN_MENU_GROUPS.map(group => group.labels.en), ['Home', 'Site Management', 'AI Operations', 'Services & Engines', 'Finance', 'Operations & Reliability', 'Settings & Integrations', 'Accounts & Security']);
  for (const group of ADMIN_MENU_GROUPS) {
    assert.ok(group.defaultSection, `${group.id} missing defaultSection`);
    assert.equal(getAdminMenuGroupForSection(group.defaultSection), group.id);
    assert.equal(getAdminMenuGroupDefault(group.id), group.defaultSection);
    assert.ok(adminMenusForGroup(group.id).length >= 1, `${group.id} has no menu`);
  }
});

test('every visible section is a detail route of exactly one v3 menu in its own group', () => {
  const visible = ADMIN_MENU_REGISTRY.filter(item => !item.internal).map(item => item.id);
  const seen = new Map();
  for (const menu of ADMIN_MENUS) {
    assert.ok(WORK_AREAS.includes(menu.group), `${menu.id} outside the eight areas`);
    assert.ok(menu.labels?.ko && menu.labels?.en, `${menu.id} missing labels`);
    for (const section of menu.sections) {
      assert.equal(seen.has(section), false, `${section} belongs to two menus`);
      seen.set(section, menu.id);
      assert.equal(getAdminMenuGroupForSection(section), menu.group, `${section} group differs from its menu`);
    }
  }
  for (const id of visible) assert.ok(seen.has(id), `${id} is visible but in no menu`);
  for (const id of seen.keys()) assert.ok(visible.includes(id), `${id} is in a menu but hidden`);
  assert.deepEqual(adminMenuOrder(), ADMIN_MENUS.flatMap(menu => menu.sections));
  assert.equal(getAdminMenuForSection('aiops')?.id, 'control');
  // ADMIN-LAYOUT-3L-001: 전체 운영상태 is merged into 홈 › 플랫폼 현황 (same panel).
  assert.deepEqual(adminMenuTabs('site-health'), ['site-health']);
  assert.equal(getAdminMenuForSection('health'), null);
  assert.deepEqual(adminMenuTabs('pos-agent'), ['devices', 'pos-agent']);
  // Stage 2: the transitional site-tools menu is dissolved.
  assert.equal(ADMIN_MENUS.some(menu => menu.id === 'site-tools' || menu.transitional), false);
  // 사이트관리 2차 = site classifications (one detail each) + the menu-template ledger.
  assert.deepEqual(ADMIN_MENUS.filter(menu => menu.group === 'sites').map(menu => menu.id), ['site-class-all', 'site-class-core', 'site-class-community', 'site-class-business', 'site-class-clients', 'site-class-knowledge', 'site-class-communication', 'site-class-worklife', 'site-class-other', 'site-class-preparing', 'menu-templates']);
  for (const menu of ADMIN_MENUS.filter(menu => menu.siteClass)) assert.equal(menu.sections.length, 1, `${menu.id} must map to one site filter`);
  assert.equal(getAdminMenuForSection('books')?.id, 'platform-content');
  assert.equal(getAdminMenuForSection('ai-membership')?.id, 'automation-policy');
  assert.equal(getAdminMenuForSection('community'), null);
});

test('every public admin subservice belongs to one canonical area', () => {
  const ids = ADMIN_MENU_REGISTRY.map(item => item.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const item of ADMIN_MENU_REGISTRY) {
    assert.ok(item.labels?.ko, `${item.id} missing Korean label`);
    assert.ok(item.labels?.en, `${item.id} missing English label`);
    assert.ok(WORK_AREAS.includes(item.group), `${item.id} is outside workbench navigation`);
  }
  assert.equal(getAdminMenuLabel('admins', 'ko'), '관리자 계정·권한');
  assert.equal(getAdminMenuLabel('admins', 'en'), 'Administrator Accounts & Access');
  assert.equal(getAdminMenuLabel('engine-common', 'ko'), '공통 엔진');
  assert.equal(getAdminMenuGroupForSection('engine-common'), 'services');
  assert.ok(adminMenuOrder().includes('security'));
  assert.ok(adminMenuOrder().includes('admins'));
  assert.equal(getAdminMenuLabel('social', 'ko'), '방송·채널·자동게시');
  assert.equal(getAdminMenuLabel('social', 'en'), 'Broadcast, Channels & Autopost');
  assert.equal(getAdminMenuGroupForSection('marketing-ai'), 'services');
  assert.equal(getAdminMenuGroupForSection('finance'), 'finance');
  assert.equal(getAdminMenuGroupForSection('workspace'), 'sites');
  assert.equal(getAdminMenuGroupForSection('community'), 'sites');
  assert.equal(getAdminMenuGroupForSection('ai-membership'), 'ai');
  assert.equal(getAdminMenuGroupForSection('books'), 'services');
  assert.equal(getAdminMenuGroupForSection('devotional'), 'services');
  assert.equal(getAdminMenuGroupForSection('storage'), 'settings');
  assert.equal(getAdminMenuLabel('devices', 'ko'), '실행 인프라');
  assert.equal(getAdminMenuLabel('devices', 'en'), 'Execution Infrastructure');
  assert.equal(getAdminMenuGroupForSection('devices'), 'ops');
  assert.equal(getAdminMenuLabel('pos-agent', 'ko'), 'POS Agent 설치·관리');
  assert.equal(getAdminMenuLabel('pos-agent', 'en'), 'POS Agent Install & Management');
  assert.equal(getAdminMenuGroupForSection('pos-agent'), 'ops');
  assert.equal(getAdminMenuCategory('pos-agent'), 'devices');
  const posAgent = ADMIN_MENU_REGISTRY.find(item => item.id === 'pos-agent');
  assert.equal(posAgent?.href, undefined);
  assert.equal(posAgent?.adminHandoff, undefined);
  assert.equal(posAgent?.superAdminOnly, true);
  assert.ok(adminMenuOrder().includes('pos-agent'));
  const execution = ADMIN_MENU_REGISTRY.find(item => item.id === 'devices');
  assert.deepEqual(execution?.governance, {
    track: 'agent',
    changeClass: 'yellow',
    authorityContext: 'Person + Workspace + Role + Capability',
    controlPlane: true,
    globalPolicyMutation: 'super_admin',
  });
});

test('admin locale is deliberately limited to Korean and English', () => {
  assert.equal(normalizeAdminLocale('ko-KR'), 'ko');
  assert.equal(normalizeAdminLocale('en-US'), 'en');
  assert.equal(normalizeAdminLocale('ja-JP'), 'ko');
});

test('admin access runtime uses protected API, authority-aware context and shared locale cookie', async () => {
  const source = await readFile(new URL('../admin-menu-runtime.js', import.meta.url), 'utf8');
  assert.match(source, /\/api\/admin-access\/google-accounts/);
  assert.match(source, /withPrivilege\(\(\) => api\('\/api\/admin-access\/google-accounts/);
  assert.ok(source.includes('authority:currentSession?.authority || null'));
  assert.match(source, /Domain=\.ekodi\.kr/);
});

test('shared admin browser modules pass syntax checks', () => {
  for (const file of ['admin-menu-registry.js', 'admin-sidebar.js', 'admin-menu-runtime.js', 'admin-menu-layout.js']) {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  }
});


test('admin submenus are categorized and unclassified sections fall back to Other last', () => {
  assert.equal(getAdminMenuCategory('communication'), 'content');
  assert.equal(getAdminMenuCategory('marketing-ai'), 'catalog');
  assert.equal(getAdminMenuCategory('unregistered-future-section'), 'other');
  assert.equal(getAdminMenuCategoryLabel('other', 'ko'), '기타');
  for (const group of WORK_AREAS) assert.equal(adminMenuCategoryOrder(group).at(-1), 'other');
});
