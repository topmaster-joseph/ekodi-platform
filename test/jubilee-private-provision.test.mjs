import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  PRIVATE_RESOURCES,verifyJubileeProvisionRequest as authorize,
  matchPrivateD1,
} from '../scripts/provision-jubilee-private-resources.mjs';
const token='not-a-real-key-for-test';
const account='b'.repeat(32);
const valid={approval:'CREATE_EKODI_PRIVATE_PUBLISHING_RESOURCES',accountId:account,token};

test('creation requires explicit private-only approval and scoped credentials',()=>{
  assert.equal(authorize(valid),true);
  for(const args of [
    {...valid,approval:'yes'}, {...valid,approval:''},
    {...valid,token:''},{...valid,accountId:''},{...valid,accountId:'bad'}])
    assert.throws(()=>authorize(args));
});
test('two unique named resources must not accidentally attach public Publishing storage',()=>{
  assert.equal(PRIVATE_RESOURCES.r2,'ekodi-publishing-private-editorial');
  assert.equal(PRIVATE_RESOURCES.d1,'ekodi-publishing-private-ingest');
  assert.notEqual(PRIVATE_RESOURCES.d1,'ekodi-publishing');
});
test('database binding selects one exact id and rejects duplicates and invalid identity',()=>{
  const uuid='65602d0d-a5f7-42d2-9827-fa20c5b39da2';
  assert.equal(matchPrivateD1([{name:'ekodi-publishing',uuid},
    {name:PRIVATE_RESOURCES.d1,uuid}]),uuid);
  assert.equal(matchPrivateD1([{name:'ekodi-publishing',uuid}]),null);
  assert.throws(()=>matchPrivateD1([{name:PRIVATE_RESOURCES.d1,uuid},
    {name:PRIVATE_RESOURCES.d1,uuid}]));
  assert.throws(()=>matchPrivateD1([{name:PRIVATE_RESOURCES.d1,uuid:'not-an-id'}]));
  assert.throws(()=>matchPrivateD1(null));
});
test('GitHub workflow is production-gated and only creates private resources and additive schema',()=>{
  const y=readFileSync(new URL('../.github/workflows/publishing-jubilee-private-provision.yml',import.meta.url),'utf8');
  const js=readFileSync(new URL('../scripts/provision-jubilee-private-resources.mjs',import.meta.url),'utf8');
  assert.match(y,/workflow_dispatch:/);
  assert.match(y,/name: EKODI AI Orchestration Gate/);
  assert.match(y,/node "\$GITHUB_WORKSPACE\/scripts\/validate-ekodi-ai-change-orchestration\.mjs" --release/);
  assert.match(y,/JUBILEE_PRIVATE_RESOURCE_APPROVAL:.*inputs\.private_resource_approval/);
  assert.match(y,/PRIVATE_D1_SCHEMA_READBACK_OK/);
  assert.match(y,/001_private_scheduled_editions\.sql/);
  assert.match(y,/004_private_jubilee_current_intake_receipts\.sql/);
  assert.match(y,/CREATE_EKODI_PRIVATE_PUBLISHING_RESOURCES/);
  assert.doesNotMatch(y,/upload-artifact|pull_request:|r2 object put|wrangler .* deploy/i);
  assert.match(js,/PRIVATE_JUBILEE_PROVISION_NO_PUBLIC_ROUTES/);
  assert.doesNotMatch(js,/\b(?:DELETE|PATCH|PUT)\b/);
});
