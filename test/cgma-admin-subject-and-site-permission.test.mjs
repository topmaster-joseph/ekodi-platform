import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveChannelAutomationSubject } from '../channel-automation-subject.js';
import { roleCanManageSite } from '../site-chrome-runtime.js';
import { workspaceAdminScript } from '../workspace-admin-page.js';

test('CGMA channel subject: client sends cgma, server matches the cheonggye auth context', async () => {
  const actor = { id: 'u1', email: 'chair@example.kr', platformAdmin: false,
    contexts: [{ workspaceId: 'tenant-uuid', workspaceSlug: 'cheonggye', workspaceKey: 'tenant:tenant-uuid', role: 'tenant_admin' }] };
  const subject = await resolveChannelAutomationSubject({}, actor, 'tenant', 'cgma');
  assert.ok(subject, 'cgma resolves for the cheonggye context');
  const script = await (await workspaceAdminScript()).text();
  assert.match(script, /if\(workspace==='cgma'\)return 'cgma';/);
});

test('site settings follow the platform role policy (admin = full); viewers cannot manage', () => {
  for (const role of ['admin', 'owner', 'tenant_admin', 'manager', 'client_admin']) assert.equal(roleCanManageSite(role), true, role);
  for (const role of ['viewer', 'member', '']) assert.equal(roleCanManageSite(role), false, role);
});

test('chrome and design admin calls build absolute URLs (no relative new URL())', async () => {
  const script = await (await workspaceAdminScript()).text();
  assert.match(script, /new URL\(SITE_CHROME_API,location\.origin\)/);
  assert.match(script, /new URL\(DESIGN_API\+path,location\.origin\)/);
});
