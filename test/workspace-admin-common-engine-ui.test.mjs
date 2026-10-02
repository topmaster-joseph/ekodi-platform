import test from 'node:test';
import assert from 'node:assert/strict';

import {
  workspaceAdminCss,
  workspaceAdminPage,
  workspaceAdminScript,
  workspaceAdminSectionsForRole,
} from '../workspace-admin-page.js';

test('workspace admins expose common engine and common-plus-site menu model', async () => {
  const response = workspaceAdminPage();
  const html = await response.text();
  assert.match(html, /data-ekodi-admin-common-engine="workspace"/);
  assert.match(html, /data-ekodi-admin-menu-model="common-plus-site"/);
  assert.match(html, /id="adminNav"/);
});

test('workspace admin removes duplicate heading chrome and strongly marks active left nav', async () => {
  const response = workspaceAdminCss();
  const css = await response.text();
  assert.match(css, /\.heading\{display:none!important\}/);
  assert.match(css, /\.sidebar nav a\.active\{[^}]*font-weight:850/);
  assert.match(css, /box-shadow:inset 3px 0 0 #111827/);
  assert.match(css, /\.sidebar nav\{display:grid;gap:1px/);
  assert.match(css, /\.sidebar nav a\{[^}]*padding:6px 9px/);
  assert.match(css, /\.admin-nav-group-label\{[^}]*margin:5px 8px 1px/);
  assert.match(css, /\.admin-nav-accordion-toggle\{/);
  assert.match(css, /\.admin-nav-accordion-panel\[hidden\]\{display:none!important\}/);
});

test('workspace admin separates common and site menus with one-open accordion behavior', async () => {
  const response = workspaceAdminScript();
  const script = await response.text();
  assert.match(script, /label:'공통 메뉴'/);
  assert.match(script, /label:'전용 메뉴'/);
  assert.match(script, /admin-nav-accordion-toggle/);
  assert.match(script, /otherButton\?\.setAttribute\('aria-expanded',isCurrent\?'true':'false'\)/);
});

test('role capability engine keeps lower admin menus scoped', () => {
  const viewer = workspaceAdminSectionsForRole('viewer');
  const admin = workspaceAdminSectionsForRole('admin');
  assert.ok(viewer.includes('overview'));
  assert.ok(admin.length >= viewer.length);
  assert.ok(!viewer.includes('members'));
});
