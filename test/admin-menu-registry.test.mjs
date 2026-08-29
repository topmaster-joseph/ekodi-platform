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

const FIVE_AXES = ['home', 'operations', 'space', 'services', 'system'];

test('admin navigation has exactly five global axes', () => {
  assert.deepEqual(ADMIN_MENU_GROUPS.map(group => group.id), FIVE_AXES);
  assert.deepEqual(ADMIN_MENU_GROUPS.map(group => group.labels.ko), ['홈', '운영', '공간', '서비스', '시스템']);
  assert.deepEqual(ADMIN_MENU_GROUPS.map(group => group.icon), ['⌂', '◎', '▦', '◇', '⚙']);
  for (const group of ADMIN_MENU_GROUPS) {
    assert.ok(group.defaultSection, `${group.id} missing defaultSection`);
    assert.equal(getAdminMenuGroupForSection(group.defaultSection), group.id);
    assert.equal(getAdminMenuGroupDefault(group.id), group.defaultSection);
  }
});

test('every public admin subservice belongs to one of the five axes', () => {
  const ids = ADMIN_MENU_REGISTRY.map(item => item.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const item of ADMIN_MENU_REGISTRY) {
    assert.ok(item.labels?.ko, `${item.id} missing Korean label`);
    assert.ok(item.labels?.en, `${item.id} missing English label`);
    assert.ok(FIVE_AXES.includes(item.group), `${item.id} is outside five-axis navigation`);
  }
  assert.equal(getAdminMenuLabel('admins', 'ko'), '관리자 · 권한');
  assert.equal(getAdminMenuLabel('admins', 'en'), 'Administrators & Access');
  assert.ok(adminMenuOrder().includes('security'));
  assert.ok(adminMenuOrder().includes('admins'));
  assert.equal(getAdminMenuGroupForSection('marketing-ai'), 'services');
  assert.equal(getAdminMenuGroupForSection('finance'), 'operations');
  assert.equal(getAdminMenuGroupForSection('workspace'), 'space');
});

test('admin locale is deliberately limited to Korean and English', () => {
  assert.equal(normalizeAdminLocale('ko-KR'), 'ko');
  assert.equal(normalizeAdminLocale('en-US'), 'en');
  assert.equal(normalizeAdminLocale('ja-JP'), 'ko');
});

test('admin access runtime uses protected Google administrator API and shared locale cookie', async () => {
  const source = await readFile(new URL('../admin-menu-runtime.js', import.meta.url), 'utf8');
  assert.match(source, /\/api\/admin-access\/google-accounts/);
  assert.match(source, /session\.role === 'super_admin'/);
  assert.match(source, /Domain=\.ekodi\.kr/);
});

test('shared admin browser modules pass syntax checks', () => {
  for (const file of ['admin-menu-registry.js', 'admin-sidebar.js', 'admin-menu-runtime.js', 'admin-menu-layout.js']) {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  }
});
