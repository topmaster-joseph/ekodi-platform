import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  ADMIN_MENU_GROUPS,
  ADMIN_MENU_REGISTRY,
  adminMenuOrder,
  getAdminMenuGroupDefault,
  getAdminMenuGroupForSection,
  getAdminMenuLabel,
  normalizeAdminLocale,
} from '../admin-menu-registry.js';

const WORK_AREAS = ['home', 'operations', 'people', 'services', 'ai', 'business', 'data', 'system'];

test('admin navigation has exactly eight stable work areas', () => {
  assert.deepEqual(ADMIN_MENU_GROUPS.map(group => group.id), WORK_AREAS);
  assert.deepEqual(ADMIN_MENU_GROUPS.map(group => group.labels.ko), ['홈', '운영', '사용자·공간', '서비스', 'AI·자동화', '비즈니스', '데이터', '시스템']);
  for (const group of ADMIN_MENU_GROUPS) {
    assert.ok(group.defaultSection, `${group.id} missing defaultSection`);
    assert.equal(getAdminMenuGroupForSection(group.defaultSection), group.id);
    assert.equal(getAdminMenuGroupDefault(group.id), group.defaultSection);
  }
});

test('every public admin subservice belongs to one work area', () => {
  const ids = ADMIN_MENU_REGISTRY.map(item => item.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const item of ADMIN_MENU_REGISTRY) {
    assert.ok(item.labels?.ko, `${item.id} missing Korean label`);
    assert.ok(item.labels?.en, `${item.id} missing English label`);
    assert.ok(WORK_AREAS.includes(item.group), `${item.id} is outside workbench navigation`);
  }
  assert.equal(getAdminMenuLabel('admins', 'ko'), '관리자 · 권한');
  assert.equal(getAdminMenuLabel('admins', 'en'), 'Administrators & Access');
  assert.ok(adminMenuOrder().includes('security'));
  assert.ok(adminMenuOrder().includes('admins'));
  assert.equal(getAdminMenuGroupForSection('marketing-ai'), 'ai');
  assert.equal(getAdminMenuGroupForSection('finance'), 'business');
  assert.equal(getAdminMenuGroupForSection('workspace'), 'people');
  assert.equal(getAdminMenuGroupForSection('storage'), 'data');
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
