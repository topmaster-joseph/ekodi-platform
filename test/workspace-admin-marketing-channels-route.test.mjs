import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isWorkspaceAdminPathShape } from '../workspace-route-policy.js';

test('mall marketing channels deep link is handled by workspace admin', async () => {
  assert.equal(isWorkspaceAdminPathShape('/ekodibiz/mall/admin/marketing/channels/'), true);
  assert.equal(isWorkspaceAdminPathShape('/ekodibiz/mall/admin/channels/'), true);
  assert.equal(isWorkspaceAdminPathShape('/ekodibiz/mall/admin/marketing/unknown/'), false);
  const source=await readFile(new URL('../workspace-admin-page.js', import.meta.url),'utf8');
  assert.match(source, /mallMarketingChannels=clean\.match/);
  assert.match(source, /mallMarketingChannels\?'channels'/);
});
