import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const src=await readFile(new URL('../scripts/ekodi-background-browser-worker.mjs',import.meta.url),'utf8');
test('native background browser paces desktop and mobile equally under CF quota policy',()=>{
  assert.ok(src.includes('const minimumGap=2200;'));
  assert.ok(!src.includes("task.deviceProfile.includes('mobile')?2200:500"));
  assert.ok(src.includes("if(quotaCircuit) return route.abort('blockedbyclient')"));
  assert.ok(src.includes("if(status===429 && new URL(res.url()).origin===ORIGIN)"));
  assert.ok(src.includes("if(status===429 || quotaCircuit)"));
  assert.ok(src.includes("if(quotaCircuit) fail('CF_QUOTA_CIRCUIT_OPEN'"));
});
test('quota error exposes only first party path and resource category, never query or body',()=>{
  assert.ok(src.includes("clean(new URL(res.url()).pathname,200)"));
  assert.ok(src.includes("resourceType:clean(res.request().resourceType(),40)"));
  assert.ok(src.includes("const quotaDetails=()=>quotaCircuit?' path='+quotaCircuit.path+' resource='+quotaCircuit.resourceType:'';"));
  assert.ok(src.includes("HTTP 429'+quotaDetails()"));
  assert.ok(!src.includes("quotaCircuit={status,path:clean(res.url()"));
  assert.ok(src.includes("no retry or further requests"));
});
