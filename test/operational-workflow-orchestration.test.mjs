import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('scheduled backup and availability monitoring validate orchestration policy without pretending to be releases',async()=>{
  const [backup,watch]=await Promise.all([
    read('.github/workflows/backup-ekodi-core.yml'),
    read('.github/workflows/admin-availability-watch.yml'),
  ]);
  for(const workflow of [backup,watch]){
    assert.match(workflow,/validate-ekodi-ai-change-orchestration\.mjs/);
    assert.doesNotMatch(workflow,/validate-ekodi-ai-change-orchestration\.mjs["']?\s+--release/);
    assert.match(workflow,/EKODI AI Orchestration Gate/);
  }
});

test('real production deployment still requires the release provenance gate',async()=>{
  const deploy=await read('.github/workflows/deploy-control-api.yml');
  assert.match(deploy,/validate-ekodi-ai-change-orchestration\.mjs["']?\s+--release/);
});
