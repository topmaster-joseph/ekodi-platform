import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source=await readFile(new URL('../scripts/provision-realtime-sfu.mjs',import.meta.url),'utf8');
const workflow=await readFile(new URL('../.github/workflows/deploy-control-api.yml',import.meta.url),'utf8');

test('realtime provisioner never prints provider credentials',()=>{
  assert.match(source,/calls\/apps/);
  assert.match(source,/sessions\/new/);
  assert.match(source,/REALTIME_SFU_APP_ID/);
  assert.match(source,/REALTIME_SFU_APP_SECRET/);
  assert.doesNotMatch(source,/console\.log\([^\n]*(uid|secret)\b/i);
});

test('production control release validates and verifies realtime provisioning',()=>{
  assert.match(workflow,/node --check scripts\/provision-realtime-sfu\.mjs/);
  assert.match(workflow,/Provision Cloudflare Realtime SFU if needed/);
  assert.match(workflow,/Verify Realtime SFU production health/);
});
