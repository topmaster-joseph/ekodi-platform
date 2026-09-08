import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isWorkspaceAdminPathShape } from '../workspace-route-policy.js';
import { workspaceAdminCanAccess, workspaceAdminScript } from '../workspace-admin-page.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('CGMA member roster is owned by the association workspace', async () => {
  assert.equal(isWorkspaceAdminPathShape('/cgma/admin/member'), true);
  assert.equal(workspaceAdminCanAccess('manager','member'), true);
  assert.equal(workspaceAdminCanAccess('workspace_admin','member'), true);
  assert.equal(workspaceAdminCanAccess('marketing_manager','member'), false);
  assert.equal(workspaceAdminCanAccess('member','member'), false);
  const script = await (await workspaceAdminScript()).text();
  assert.match(script, /workspace==='cgma'/);
  assert.match(script, /member:POLICY\.capabilities\.memberRoster/);
  assert.match(script, /cgma-member-admin\.js/);
  assert.match(script, /site',workspace==='cgma'\?'cgma':'space'/);
});

test('CGMA member projection cannot control Google credentials', async () => {
  const [member, storage, site, layout] = await Promise.all([
    read('cgma-member-admin.js'), read('google-drive-storage-control.js'), read('site-worker.js'), read('admin-menu-layout.js'),
  ]);
  assert.match(member, /api\/control\/storage\/google\/cheonggye-members/);
  assert.doesNotMatch(member, /oauth\/start/);
  assert.match(storage, /cheonggyeWorkspaceSession/);
  assert.match(storage, /current_site_activity_contexts/);
  assert.match(storage, /CHEONGGYE_WORKSPACE_ADMIN_ROLES/);
  assert.match(site, /api\/control\/storage\/google\/cheonggye-members/);
  assert.match(site, /proxyAdminStorage\(request, env\)/);
  assert.match(layout, /LEGACY_CGMA_MEMBER_HASH/);
  assert.match(layout, /https:\/\/ekodi\.kr\/cgma\/admin\/member/);
  assert.doesNotMatch(layout, /openCheonggyeMembers|import\('\.\/cheonggye-members-admin\.js'\)/);
});
