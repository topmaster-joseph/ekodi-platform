import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isWorkspaceAdminPathShape } from '../workspace-route-policy.js';
const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('canonical Mall and child-service publishing routes use site-owned admins', async()=>{
  assert.equal(isWorkspaceAdminPathShape('/ekodibiz/ekodimall/admin/'),true);
  assert.equal(isWorkspaceAdminPathShape('/ekodibiz/ekodimall/admin/channel-settings/'),true);
  assert.equal(isWorkspaceAdminPathShape('/admin/ekodimall/channel-settings/'),false);
  assert.equal(isWorkspaceAdminPathShape('/ekodibiz/ekodimall/admin/channels/'),false);
  assert.equal(isWorkspaceAdminPathShape('/ekodibiz/trade/admin/publishing/'),true);
  assert.equal(isWorkspaceAdminPathShape('/cgma/admin/publishing/'),true);
  const source=await read('workspace-admin-page.js');
  assert.match(source,/genericService=clean\.match/);
  assert.match(source,/service==='mall'\?`\$\{base\}\/ekodimall\/admin`/);
  assert.match(source,/service\?`\$\{base\}\/\$\{service\}\/admin`/);
  assert.match(source,/visibleChannelIds/);
});

test('channel admin is login-first and authenticates pre-registered account rows',async()=>{
  const source=await read('workspace-admin-page.js');
  for(const marker of ['channelAccountForm','data-account-auth','registryConnectionId','EXTERNAL_ACCOUNT_CONTROL']) assert.ok(source.includes(marker),marker);
  assert.match(source,/externalAccountApi\('\/accounts'/);
  assert.match(source,/channelPreAuth\(\).*loginPanel/s);
  assert.doesNotMatch(source,/CHANNEL_INTENT_KEY|pendingChannelIntent|CHANNEL_TARGET_ACCOUNTS/);
  assert.doesNotMatch(source,/topmaster\.joseph@gmail\.com/);
});
