import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const workflow=fs.readFileSync('.github/workflows/tenant-live-production-e2e.yml','utf8');
const script=fs.readFileSync('scripts/tenant-live-production-e2e.mjs','utf8');

test('tenant live production E2E stays bounded and self-cleaning',()=>{
  assert.match(workflow,/workflow_dispatch:/);
  assert.match(workflow,/branches: \[main\]/);
  assert.match(workflow,/TENANT_LIVE_TENANT: ekodibiz/);
  for(const path of ['realtime-control.js','realtime-tenant-registry.js','tenant-live-page.js','tenant-live.js','tenant-live.css']){
    assert.ok(workflow.includes(`- '${path}'`),`missing production E2E trigger: ${path}`);
  }
  assert.match(workflow,/Issue short-lived super-admin session/);
  assert.match(workflow,/Revoke short-lived E2E session/);
  assert.match(workflow,/if: always\(\) && env\.E2E_AUTH_DB_ID != '' && env\.E2E_TOKEN_HASH != ''/);
  assert.match(workflow,/DELETE FROM sessions WHERE token_hash/);
  assert.doesNotMatch(workflow,/SUPABASE_SERVICE_ROLE|service_role/i);
});

test('tenant live E2E proves anonymous media delivery and safe skip',()=>{
  assert.match(script,/active_tenant_broadcast/);
  assert.match(script,/--use-fake-device-for-media-stream/);
  assert.match(script,/sessionStorage\.setItem\('ekodi-auth-token'/);
  assert.match(script,/viewerContext=await browser\.newContext\(\)/);
  assert.doesNotMatch(script,/viewerContext\.addInitScript/);
  assert.match(script,/viewer_received_no_live_track/);
  assert.match(script,/viewerTracks>=1/);
  assert.match(script,/status:'ended'/);
  assert.match(script,/assert\.equal\(ended\.live,false\)/);
});
