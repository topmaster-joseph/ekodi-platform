import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow=await readFile(new URL('../.github/workflows/retire-public-subdomains-wave1.yml',import.meta.url),'utf8');

test('wave1 retirement reads Production Cloudflare quota before any apex probe or detach',()=>{
  const quota=workflow.indexOf('Read Production Cloudflare quota Source of Truth');
  const detach=workflow.indexOf('Detach proven-safe public Worker domains with rollback');
  assert.ok(quota>=0);
  assert.ok(detach>quota);
  assert.match(workflow,/cloudflare-production-budget\.mjs/);
});

test('protect or exhausted quota defers retirement without retrying production endpoints',()=>{
  assert.match(workflow,/steps\.quota\.outputs\.skip_nonessential == 'true'/);
  assert.match(workflow,/no apex probe, no detach, no retry/);
  assert.match(workflow,/steps\.quota\.outputs\.skip_nonessential != 'true'/);
});
