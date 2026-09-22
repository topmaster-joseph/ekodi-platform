import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {availableSampleModules,runCapabilitySample,CAPABILITY_SAMPLE_POLICY} from '../capability-sample-runtime.js';
const foundry=JSON.parse(fs.readFileSync(new URL('../config/capability-foundry.json',import.meta.url),'utf8'));
const registry=JSON.parse(fs.readFileSync(new URL('../config/capability-registry.json',import.meta.url),'utf8'));

test('sample runtime is synthetic-only and never creates a service',()=>{
  assert.equal(CAPABILITY_SAMPLE_POLICY.dataPolicy,'synthetic_only');
  assert.equal(CAPABILITY_SAMPLE_POLICY.productionWrites,false);
  const recipe=foundry.sampleRecipes[0];
  const result=runCapabilitySample({recipe,registry});
  assert.equal(result.state,'sample_verified');
  assert.equal(result.serviceCreated,false);
  assert.equal(result.userServiceReady,false);
  assert.equal(result.evidence.productionMutation,false);
});

test('all declared sample modules have runtime implementations',()=>{
  const runtime=new Set(availableSampleModules());
  for(const module of foundry.modules)assert.equal(runtime.has(module.id),true,module.id);
});

test('all sample recipes resolve only registered capabilities',()=>{
  for(const recipe of foundry.sampleRecipes){
    const result=runCapabilitySample({recipe,registry});
    assert.equal(result.state,'sample_verified',recipe.id);
    assert.deepEqual(result.capabilities.missing,[]);
  }
});

test('non-synthetic input is blocked',()=>{
  const recipe=foundry.sampleRecipes[0];
  const result=runCapabilitySample({recipe,registry,input:{synthetic:false,afterText:'real data'}});
  assert.equal(result.state,'sample_blocked');
  assert.equal(result.reason,'synthetic_input_required');
});

test('change detector and source verifier produce reusable evidence',()=>{
  const recipe=foundry.sampleRecipes.find(item=>item.id==='official-update-brief');
  const result=runCapabilitySample({recipe,registry});
  assert.equal(result.preview.changed,true);
  assert.equal(result.preview.language,'ko');
  assert.ok(result.preview.sourceScore>=90);
});
