import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { familyLeaseReceiptAllowed } from '../ai-family-dispatch.js';

test('family result receipt rejects absent, malformed and expired leases', () => {
  const now=Date.parse('2026-11-07T00:00:00Z');
  assert.equal(familyLeaseReceiptAllowed(null,now),false);
  assert.equal(familyLeaseReceiptAllowed('',now),false);
  assert.equal(familyLeaseReceiptAllowed('not-a-date',now),false);
  assert.equal(familyLeaseReceiptAllowed('2026-11-06T23:59:59Z',now),false);
  assert.equal(familyLeaseReceiptAllowed('2026-11-07T00:00:00Z',now),false);
  assert.equal(familyLeaseReceiptAllowed('2026-11-07T00:00:01Z',now),true);
  assert.equal(familyLeaseReceiptAllowed('2026-11-07T00:00:01Z',Number.NaN),false);
});

test('authenticated native result writes are fenced atomically in SQL', async () => {
  const source=await readFile(new URL('../hybrid-execution.js',import.meta.url),'utf8');
  const begin=source.indexOf('export async function handleHybridAgentResult(');
  const end=source.indexOf('export async function handleHybridAgentHeartbeat(',begin);
  assert.ok(begin>=0&&end>begin);
  const result=source.slice(begin,end);
  assert.match(result,/FAMILY_TASK_TYPES\.has\(job\.task_type\)&&!familyLeaseReceiptAllowed\(job\.lease_expires_at\)/);
  const fences=result.match(/task_type NOT IN \('ai\.family\.codex','ai\.family\.claude-code'\) OR lease_expires_at>=\?/g)||[];
  assert.equal(fences.length,4,'success, auth, retry and failure updates all need a lease fence');
  const binds=result.match(/\.bind\([^\n]+device\.id, now\)\.run\(\);/g)||[];
  assert.equal(binds.length,4,'every guarded mutation must bind the comparison timestamp');
});
