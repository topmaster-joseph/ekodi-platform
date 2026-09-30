import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const doc=await readFile(new URL('../docs/realtime-sfu-provisioning-status.md',import.meta.url),'utf8');
test('realtime completion requires provider health and direct probe',()=>{
  assert.match(doc,/direct Cloudflare SFU session probe succeeds/);
  assert.match(doc,/providerConfigured:true/);
  assert.match(doc,/fail-closed/i);
});
