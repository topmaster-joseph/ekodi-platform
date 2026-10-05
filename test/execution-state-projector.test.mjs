import test from 'node:test';
import assert from 'node:assert/strict';
import {projectExecutionState,completionGap} from '../execution-state-projector.js';

test('state is completed only when completion contract evidence is complete',()=>{
 const evidence=['authorized_task','verified_artifact','required_gates','merged_change','staging_verified','production_verified','live_verified'].map(kind=>({kind}));
 assert.equal(projectExecutionState({evidence}).state,'completed');
 assert.deepEqual(completionGap({evidence}),[]);
});

test('expired execution claim is recoverable instead of stranded assigned',()=>{
 const events=[{kind:'authorized_task'},{kind:'execution_claimed',leaseExpiresAt:'2026-01-01T00:00:00.000Z'}];
 assert.equal(projectExecutionState({events,now:Date.parse('2026-10-05T00:00:00.000Z')}).state,'recoverable');
});

test('contradictory evidence fails closed into reconciliation',()=>{
 assert.equal(projectExecutionState({evidence:[{kind:'evidence_conflict'}]}).state,'needs_reconciliation');
});

test('partial production evidence never becomes completed',()=>{
 const evidence=['authorized_task','verified_artifact','required_gates','merged_change','staging_verified','production_verified'].map(kind=>({kind}));
 assert.notEqual(projectExecutionState({evidence}).state,'completed');
 assert.deepEqual(completionGap({evidence}),['live_verified']);
});
