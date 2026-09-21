import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  ADMIN_MENU_GROUPS,
  ADMIN_MENU_REGISTRY,
  adminMenuOrder,
  adminMenuCategoryOrder,
  getAdminMenuCategory,
  getAdminMenuCategoryLabel,
  getAdminMenuGroupDefault,
  getAdminMenuGroupForSection,
  getAdminMenuLabel,
  normalizeAdminLocale,
} from '../admin-menu-registry.js';

const WORK_AREAS = ['summary', 'services', 'sites', 'people', 'content', 'status', 'settings-records'];

test('admin navigation has exactly seven canonical EKODI areas', () => {
  assert.deepEqual(ADMIN_MENU_GROUPS.map(group => group.id), WORK_AREAS);
  assert.deepEqual(ADMIN_MENU_GROUPS.map(group => group.labels.en), ['Integrated Overview','Services','Sites','Users & Access','Content & Operations','Status & Releases','Settings & Records']);
  for (const group of ADMIN_MENU_GROUPS) {
    assert.ok(group.defaultSection, `${group.id} missing defaultSection`);
    assert.equal(getAdminMenuGroupForSection(group.defaultSection), group.id);
    assert.equal(getAdminMenuGroupDefault(group.id), group.defaultSection);
  }
});

test('every public admin subservice belongs to one canonical area', () => {
  const ids = ADMIN_MENU_REGISTRY.map(item => item.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const item of ADMIN_MENU_REGISTRY) {
    assert.ok(item.labels?.ko, `${item.id} missing Korean label`);
    assert.ok(item.labels?.en, `${item.id} missing English label`);
    assert.ok(WORK_AREAS.includes(item.group), `${item.id} is outside workbench navigation`);
  }
  assert.equal(getAdminMenuLabel('admins', 'ko'), '관리자설정');
  assert.equal(getAdminMenuLabel('admins', 'en'), 'Administrator Settings');
  assert.equal(getAdminMenuLabel('engine-common', 'ko'), '공통 엔진');
  assert.equal(getAdminMenuGroupForSection('engine-common'), 'services');
  assert.ok(adminMenuOrder().includes('security'));
  assert.ok(adminMenuOrder().includes('admins'));
  assert.equal(getAdminMenuLabel('social', 'ko'), '방송·채널·자동게시');
  assert.equal(getAdminMenuLabel('social', 'en'), 'Broadcast, Channels & Autopost');
  assert.equal(getAdminMenuGroupForSection('marketing-ai'), 'services');
  assert.equal(getAdminMenuGroupForSection('finance'), 'content');
  assert.equal(getAdminMenuGroupForSection('workspace'), 'sites');
  assert.equal(getAdminMenuGroupForSection('community'), 'content');
  assert.equal(getAdminMenuGroupForSection('ai-membership'), 'people');
  assert.equal(getAdminMenuGroupForSection('books'), 'content');
  assert.equal(getAdminMenuGroupForSection('devotional'), 'content');
  assert.equal(getAdminMenuGroupForSection('storage'), 'settings-records');
  assert.equal(getAdminMenuLabel('devices', 'ko'), '실행 인프라');
  assert.equal(getAdminMenuLabel('devices', 'en'), 'Execution Infrastructure');
  assert.equal(getAdminMenuGroupForSection('devices'), 'status');
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
