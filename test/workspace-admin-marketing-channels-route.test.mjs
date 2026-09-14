import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isWorkspaceAdminPathShape } from '../workspace-route-policy.js';

test('Mall channel settings has one canonical site-owned admin deep link', async () => {
  assert.equal(isWorkspaceAdminPathShape('/ekodibiz/ekodimall/admin/'), true);
  assert.equal(isWorkspaceAdminPathShape('/ekodibiz/ekodimall/admin/channel-settings/'), true);
  assert.equal(isWorkspaceAdminPathShape('/admin/ekodimall/'), false);
  assert.equal(isWorkspaceAdminPathShape('/admin/ekodimall/channel-settings/'), false);
  assert.equal(isWorkspaceAdminPathShape('/ekodibiz/ekodimall/admin/marketing/channels/'), false);
  assert.equal(isWorkspaceAdminPathShape('/ekodibiz/ekodimall/admin/channels/'), false);
  assert.equal(isWorkspaceAdminPathShape('/ekodibiz/mall/admin/channels/'), false);
  assert.equal(isWorkspaceAdminPathShape('/ekodibiz/ekodimall/admin/sourcing/'), true);
  assert.equal(isWorkspaceAdminPathShape('/ekodibiz/ekodimall/admin/growth/'), true);
  const source=await readFile(new URL('../workspace-admin-page.js', import.meta.url),'utf8');
  assert.match(source,/canonicalMall=clean\.match/);
  assert.match(source,/rawSection==='channel-settings'\?'channels':rawSection/);
  assert.match(source,/adminBase=service\?`\$\{base\}\/ekodimall\/admin`/);
  assert.match(source,/sectionHref=key=>key==='overview'\?adminBase/);
});

test('unauthenticated Mall channel setup still selects provider before provider login', async () => {
  const source=await readFile(new URL('../workspace-admin-page.js', import.meta.url),'utf8');
  assert.match(source,/CHANNEL_INTENT_KEY='ekodi-workspace-channel-intent'/);
  assert.match(source,/function channelPreAuth\(\)/);
  assert.match(source,/data-channel-preauth/);
  assert.match(source,/if\(service==='mall'&&section==='channels'\)return channelPreAuth\(\)/);
  assert.match(source,/pendingChannelIntent\(\)/);
  assert.match(source,/return startChannelConnect\(pendingProvider\)/);
  assert.match(source,/'ekodimall:mall:youtube':'topmaster\.joseph@gmail\.com'/);
  assert.match(source,/const accountHint=channelTargetAccount\(provider\)/);
  assert.match(source,/metadata\?\.authorizedEmail/);
});
