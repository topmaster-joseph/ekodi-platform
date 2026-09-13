import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const script=await readFile(new URL('../scripts/church-live-production-e2e.mjs',import.meta.url),'utf8');
const workflow=await readFile(new URL('../.github/workflows/church-live-production-e2e.yml',import.meta.url),'utf8');

test('Church Live production E2E is safe around real broadcasts and proves remote media',()=>{
  assert.match(script,/active_church_broadcast/);
  assert.match(script,/use-fake-device-for-media-stream/);
  assert.match(script,/viewer_received_no_live_track/);
  assert.match(script,/status:'ended'/);
});

test('Church Live E2E uses short-lived central admin auth and always revokes it',()=>{
  assert.match(workflow,/\+20 minutes/);
  assert.match(workflow,/https:\/\/ekodi\.kr\/api\/session/);
  assert.match(workflow,/DELETE FROM sessions WHERE token_hash/);
  assert.match(workflow,/if: always\(\)/);
});
