import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('provider boundary guard rejects service-level direct provider access',()=>{
  const result=spawnSync(process.execPath,['scripts/validate-ai-provider-boundary.mjs'],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr||result.stdout);
  assert.match(result.stdout,/provider boundary verified/i);
});
