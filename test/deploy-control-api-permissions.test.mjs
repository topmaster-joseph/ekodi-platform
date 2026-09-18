import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow=await readFile(new URL('../.github/workflows/deploy-control-api.yml',import.meta.url),'utf8');

test('Control API production release can verify merged-PR provenance with least privilege',()=>{
  const permissions=workflow.match(/permissions:\n([\s\S]*?)\n\n/)?.[1]||'';
  assert.match(permissions,/contents:\s*read/);
  assert.match(permissions,/pull-requests:\s*read/);
  assert.match(permissions,/statuses:\s*write/);
  assert.doesNotMatch(permissions,/contents:\s*write/);
});
