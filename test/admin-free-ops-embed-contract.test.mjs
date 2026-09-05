import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflowPath='.github/workflows/verify-admin-free-ops-embed.yml';

test('Admin Free Ops verifier follows the canonical ekodi.kr embed origin',async()=>{
  const workflow=await readFile(workflowPath,'utf8');
  assert.match(workflow,/https:\/\/ekodi\.kr\/ekodibiz\/mall\/free-ops\?embed=admin/);
  assert.match(workflow,/frame-src\[\^;\]\*https:\/\/ekodi\\\.kr/);
  assert.doesNotMatch(workflow,/frame-src\[\^;\]\*https:\/\/mall\\\.ekodi\\\.kr/);
});

test('Admin remains non-embeddable while only the Free Ops page may be framed by Admin',async()=>{
  const workflow=await readFile(workflowPath,'utf8');
  assert.match(workflow,/frame-ancestors '\\''none'\\''/);
  assert.match(workflow,/frame-ancestors https:\/\/admin\\\.ekodi\\\.kr/);
  assert.match(workflow,/x-frame-options:\[\[:space:\]\]\*DENY/);
});
