import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const e2e=read('scripts/verify-admin-production-ui-e2e.mjs');
const source=read('ai-ops-admin.js');
const workflow=read('.github/workflows/deploy-site-core.yml');
const dispatcher=read('scripts/converge-orchestrated-pr-merge.mjs');

test('production Admin browser verifier exercises all five AI Ops stages',()=>{
  assert.match(e2e,/function verifyAiOpsStageWorkspace\(\)/);
  for(const id of ['overview','providers','sites','reports','command']){
    assert.ok(e2e.includes("'"+id+"'"),'missing live stage '+id);
    assert.ok(source.includes('data-aiops-stage-tab="'+id+'"'),'source stage missing '+id);
  }
  assert.match(e2e,/await verifyAiOpsStageWorkspace\(\)/);
  assert.match(e2e,/getAttribute\('aria-pressed'\)/);
  assert.match(e2e,/Site detail exposed before selecting a site/);
  assert.match(e2e,/\\.ai-fleet-row\\.selected/);
  assert.match(e2e,/ArrowRight/);
  assert.match(e2e,/width:390,height:844/);
  assert.match(e2e,/AI Ops mobile tab layout clipped/);
});

test('browser verifies live assets with only synthetic read-only session and protected release',()=>{
  assert.match(e2e,/SYNTHETIC_TOKEN = 'ekodi-production-ui-e2e'/);
  assert.match(e2e,/const SYNTHETIC_EMAIL/);
  const verifier=e2e.slice(e2e.indexOf('async function verifyAiOpsStageWorkspace()'),e2e.indexOf('let selectedWorkArea = null'));
  for(const marker of ['fetch(', "method:'PUT'", "method:'POST'", "method:'DELETE'"]) assert.ok(!verifier.includes(marker), 'unexpected mutation in UI verifier: '+marker);
  assert.ok(workflow.includes("'scripts/verify-admin-production-ui-e2e.mjs'"));
  assert.ok(dispatcher.includes("'scripts/verify-admin-production-ui-e2e.mjs'"));
});
