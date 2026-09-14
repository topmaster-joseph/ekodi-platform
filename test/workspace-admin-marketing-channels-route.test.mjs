import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isWorkspaceAdminPathShape } from '../workspace-route-policy.js';

test('Mall and generic service channel routes use the shared workspace admin', async () => {
  assert.equal(isWorkspaceAdminPathShape('/admin/ekodimall/'), false);
  assert.equal(isWorkspaceAdminPathShape('/admin/ekodimall/channel-settings/'), false);
  assert.equal(isWorkspaceAdminPathShape('/ekodibiz/ekodimall/admin/channel-settings/'), true);
  assert.equal(isWorkspaceAdminPathShape('/ekodibiz/ekodimall/admin/channels/'), true);
  assert.equal(isWorkspaceAdminPathShape('/ekodibiz/trade/admin/publishing/'), true);
  assert.equal(isWorkspaceAdminPathShape('/cgma/admin/publishing/'), true);
  const source=await readFile(new URL('../workspace-admin-page.js', import.meta.url),'utf8');
  assert.match(source, /canonicalMall=clean\.match/);
  assert.match(source, /adminBase=service==='mall'\?'\/ekodibiz\/ekodimall\/admin'/);
  assert.match(source, /service\?`\$\{base\}\/\$\{service\}\/admin`/);
  assert.match(source, /service channel job isolation|visibleChannelIds/);
});

test('channel admin is login-first and uses pre-registered account rows', async () => {
  const source=await readFile(new URL('../workspace-admin-page.js', import.meta.url),'utf8');
  assert.match(source, /channelAccountForm/);
  assert.match(source, /data-account-auth/);
  assert.match(source, /registryConnectionId/);
  assert.match(source, /externalAccountApi\('\/accounts'/);
  assert.match(source, /운영공간 로그인 후 등록된 게시계정별 인증 버튼/);
  assert.doesNotMatch(source, /ekodimall:mall:youtube/);
  assert.doesNotMatch(source, /topmaster\.joseph@gmail\.com/);
});
