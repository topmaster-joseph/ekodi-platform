import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('subservices and store admins inherit the multi-account channel center', async () => {
  const [workspace,trade,store,growth,migration]=await Promise.all([
    readFile(new URL('../workspace-admin-page.js',import.meta.url),'utf8'),
    readFile(new URL('../workspace-trade-admin-page.js',import.meta.url),'utf8'),
    readFile(new URL('../store-admin-engine.js',import.meta.url),'utf8'),
    readFile(new URL('../marketing-growth-worker.js',import.meta.url),'utf8'),
    readFile(new URL('../migrations/0086_channel_multi_account_registry.sql',import.meta.url),'utf8'),
  ]);
  assert.match(workspace,/workspace==='cgma'.*publishing/s);
  assert.match(workspace,/authorityRef:channelRegistryAuthority\(\)/);
  assert.match(trade,/\['publishing','채널 · 게시'\]/);
  assert.match(trade,/\['publishing','marketing','channels'\]\.includes\(section\)/);
  assert.match(store,/publishing:\['채널 · 게시'/);
  assert.match(store,/subject_type=store&subject_key=/);
  assert.match(store,/authorityRef:`store:\$\{STORE_ID\}`/);
  assert.match(store,/marketing-connect-api\.ekodi\.kr/);
  assert.match(store,/marketing-publish-api\.ekodi\.kr/);
  assert.match(growth,/registryWorkspaceSlug/);
  assert.match(growth,/subject\?\.type==='store'/);
  assert.match(growth,/autoPublishEnabled:false/);
  assert.match(migration,/registry_connection_id/);
});
