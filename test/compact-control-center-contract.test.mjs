import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { ADMIN_MENU_GROUPS, ADMIN_MENU_REGISTRY } from '../admin-menu-registry.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [css, sidebar, shell, postbuild] = await Promise.all([
  read('admin-compact.css'), read('admin-sidebar.js'),
  read('admin-authenticated-shell.js'), read('scripts/admin-thin-postbuild.mjs')
]);

test('compact Admin uses the canonical eight-area navigation', () => {
  assert.equal(ADMIN_MENU_GROUPS.length, 8);
  assert.equal(ADMIN_MENU_REGISTRY.some(item => item.id === 'campus' && !item.internal), true);
  assert.equal(ADMIN_MENU_REGISTRY.some(item => item.id === 'policies' && item.internal), true);
  assert.match(sidebar, /admin-global-navs/);
  assert.match(sidebar, /admin-context-tabs/);
});

test('compact visual layer reduces dashboard density without owning authentication', () => {
  assert.match(css, /body\.admin-compact/);
  assert.match(css, /campus-layout|campus-panel/);
  assert.doesNotMatch(css, /\/api\/google\/login|\/api\/login/);
  assert.match(shell, /admin-menu-layout\.js/);
});
test('compact runtime is generated after authentication instead of shipped as legacy source', () => {
  assert.match(postbuild, /admin-compact\.js/);
  assert.match(postbuild, /Assist launcher-only first path|compact runtime/i);
  assert.doesNotMatch(shell, /control-center\.js/);
});
