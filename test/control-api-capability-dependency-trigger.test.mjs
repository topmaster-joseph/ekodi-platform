import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow=fs.readFileSync(new URL('../.github/workflows/deploy-control-api.yml',import.meta.url),'utf8');

test('Control API release watches Capability accumulation runtime dependencies',()=>{
  for(const path of [
    'config/capability-foundry.json',
    'config/capability-accumulation-policy.json',
    'ekodi-capability-ecosystem.js',
    'ekodi-capability-ecosystem-store.js',
    'ekodi-capability-sandbox.js',
    'ekodi-capability-accumulation.js',
    'ekodi-self-automation-engine.js',
  ]){
    const count=workflow.split(`- '${path}'`).length-1;
    assert.ok(count>=2,`${path} must trigger Control API for pull_request and main push`);
  }
});

test('Control API validation executes Capability accumulation runtime and tests',()=>{
  assert.match(workflow,/ekodi-capability-accumulation\.js ekodi-self-automation-engine\.js/);
  assert.match(workflow,/test\/ekodi-10g-capability-ecosystem\.test\.mjs/);
  assert.match(workflow,/test\/capability-accumulation\.test\.mjs/);
  assert.match(workflow,/test\/capability-before-service-enforcement\.test\.mjs/);
});
