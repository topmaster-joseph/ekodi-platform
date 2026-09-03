import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { isWorkspaceAdminPath, workspaceAdminScript } from '../workspace-admin-page.js';

test('tenant and service admins use site-local canonical paths', async () => {
  assert.equal(isWorkspaceAdminPath('/ekodibiz/admin/'), true);
  assert.equal(isWorkspaceAdminPath('/ekodibiz/mall/admin/'), true);
  assert.equal(isWorkspaceAdminPath('/jadam/admin/'), true);
  assert.equal(isWorkspaceAdminPath('/jadam/marketing/admin/channels'), true);
  assert.equal(isWorkspaceAdminPath('/admin/'), false);
  assert.equal(isWorkspaceAdminPath('/org/ekodibiz/mall/admin/'), true);
  const siteWorker = await fs.readFile(new URL('../site-worker.js', import.meta.url), 'utf8');
  assert.match(siteWorker, /url\.pathname === '\/mall\/admin'.*\/ekodibiz\/mall\/admin/s);
  const js = await workspaceAdminScript().text();
  assert.match(js, /\(\?:org\\\/\)\?/);
  assert.match(js, /const base=`\/\$\{workspace\}`/);
  assert.match(js, /marketing-connect-api\.ekodi\.kr/);
  assert.ok(js.includes('Google로 YouTube 연결'));
  assert.match(js, /subject_type=tenant/);
});
