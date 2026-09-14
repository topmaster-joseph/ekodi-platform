import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read=p=>readFile(new URL(`../${p}`,import.meta.url),'utf8');

test('subservices and store admins inherit the multi-account channel center',async()=>{
  const [workspace,trade,store,growth,migration]=await Promise.all([
    read('workspace-admin-page.js'),read('workspace-trade-admin-page.js'),read('store-admin-engine.js'),
    read('marketing-growth-worker.js'),read('migrations/0090_channel_multi_account_registry.sql')]);
  assert.match(workspace,/genericService=clean\.match/);
  assert.match(workspace,/authorityRef:channelRegistryAuthority\(\)/);
  assert.match(workspace,/visibleChannelIds/);
  assert.match(trade,/\['publishing','marketing','channels'\]\.includes\(section\)/);
  assert.match(trade,/\['publishing','channels'/);
  assert.match(store,/section==='publishing'/);
  assert.match(store,/STORE_SECTIONS=.*publishing/);
  assert.match(store,/subject_type=store&subject_key=/);
  assert.match(store,/authorityRef:`store:\$\{STORE_ID\}`/);
  assert.match(store,/marketing-connect-api\.ekodi\.kr/);
  assert.match(store,/marketing-publish-api\.ekodi\.kr/);
  assert.match(growth,/registryWorkspaceSlug/);
  assert.match(growth,/subject\?\.type==='store'/);
  assert.match(growth,/autoPublishEnabled:false/);
  assert.match(migration,/registry_connection_id/);
});
