import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { workspaceAdminPage, workspaceAdminCss, workspaceAdminScript } from '../workspace-admin-page.js';

test('tenant admin generated HTML/CSS/JS preserve compact tabs and syntax', async () => {
  const htmlResponse = workspaceAdminPage();
  const html = await htmlResponse.text();
  const css = await workspaceAdminCss().text();
  const js = await workspaceAdminScript().text();
  assert.equal(htmlResponse.headers.get('cache-control'), 'no-store');
  assert.match(html, /data-ekodi-admin-view-tabs/);
  assert.match(html, /id="summaryCards"[^>]*hidden/);
  assert.match(html, /id="mainPanel"[^>]*role="tabpanel"/);
  assert.match(css, /\.admin-view-tabs/);
  assert.match(css, /max-width:700px/);
  assert.match(js, /function workspaceAdminCompact/);
  assert.doesNotThrow(() => new vm.Script(js, { filename: 'workspace-admin.generated.js' }));
});
