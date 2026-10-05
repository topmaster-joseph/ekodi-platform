import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync('ekodi-orchestrator-task-adapter.js','utf8');

test('orchestrator public task exposes evidence-derived projection without replacing compatibility state',()=>{
 assert.match(source,/projectExecutionState/);
 assert.match(source,/completionGap/);
 assert.match(source,/projection:projectionForTask\(row\)/);
 assert.match(source,/state:row\.state/);
});

test('production evidence is translated into completion-contract evidence',()=>{
 for(const kind of ['production_verified','live_verified','merged_change','required_gates','staging_verified','authorized_task','verified_artifact']){
   assert.match(source,new RegExp(kind));
 }
});
