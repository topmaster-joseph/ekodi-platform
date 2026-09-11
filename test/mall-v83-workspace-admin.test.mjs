import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { isWorkspaceAdminPath, workspaceAdminScript } from '../workspace-admin-page.js';

test('Mall v8.3 stays inside canonical Workspace Admin', async () => {
  assert.equal(isWorkspaceAdminPath('/ekodibiz/mall/admin/'), true);
  assert.equal(isWorkspaceAdminPath('/ekodibiz/mall/admin/growth'), true);
  assert.equal(isWorkspaceAdminPath('/ekodibiz/mall/admin/analytics'), true);
  const js = await workspaceAdminScript().text();
  assert.match(js, /\/mall\/api\/growth\/insights/);
  assert.match(js, /minFeedbackSample/);
  assert.match(js, /maxNegativeFeedbackRate/);
  assert.ok(js.includes('확정 순익'));
  assert.ok(js.includes('부정 피드백'));
  assert.ok(js.includes('전략기억'));
});

test('shared site router keeps Workspace Admin ahead of Mall proxy', async () => {
  const source = await fs.readFile(new URL('../site-worker.js', import.meta.url), 'utf8');
  assert.ok(source.indexOf('isWorkspaceAdminPath(url.pathname)') < source.indexOf('isMallPath(url.pathname)'));
});