import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Church public root publishes EKODI tenant readability ownership headers',async()=>{
  const headers=await readFile(new URL('../_headers',import.meta.url),'utf8');
  const root=headers.match(/^\/\r?\n([\s\S]*?)(?=^\/\*\r?\n)/m)?.[1]||'';
  assert.match(root,/X-EKODI-Tenant-Readability:\s*v1/i);
  assert.match(root,/X-EKODI-Operating-Space-Label:\s*v1/i);
  const wildcard=headers.match(/^\/\*\r?\n([\s\S]*)$/m)?.[1]||'';
  assert.match(wildcard,/Content-Security-Policy:/);
  assert.match(wildcard,/X-Content-Type-Options:\s*nosniff/i);
});
