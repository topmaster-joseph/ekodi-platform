import test from 'node:test';
import assert from 'node:assert/strict';
import {projectExecutionState,completionGap,projectDeploymentGate,requiredDeploymentGatesForRisk} from '../execution-state-projector.js';

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


test('three-gate deployment projection keeps detailed lifecycle internal',()=>{
 assert.deepEqual(requiredDeploymentGatesForRisk('low'),['build','production']);
 assert.deepEqual(requiredDeploymentGatesForRisk('normal'),['build','release','production']);
 assert.equal(projectDeploymentGate({state:'pr_gates',risk:'normal',deploymentRequested:true}).current,'build');
 assert.equal(projectDeploymentGate({state:'staging',risk:'normal',deploymentRequested:true}).current,'release');
 assert.equal(projectDeploymentGate({state:'production_verifying',risk:'normal',deploymentRequested:true}).current,'production');
});

test('low-risk release checks collapse from public stages without being removed',()=>{
 const view=projectDeploymentGate({state:'staging',risk:'low',deploymentRequested:true});
 assert.deepEqual(view.requiredGates,['build','production']);
 assert.deepEqual(view.collapsedGates,['release']);
 assert.equal(view.detailedState,'staging');
 assert.equal(view.done,false);
});

test('production evidence remains mandatory for DONE',()=>{
 const withoutEvidence=projectDeploymentGate({state:'completed',risk:'normal',deploymentRequested:true});
 const withEvidence=projectDeploymentGate({state:'completed',risk:'normal',deploymentRequested:true,productionEvidence:{verified:true}});
 assert.equal(withoutEvidence.current,'done');
 assert.equal(withoutEvidence.done,false);
 assert.equal(withoutEvidence.status,'in_progress');
 assert.equal(withEvidence.current,'done');
 assert.equal(withEvidence.done,true);
 assert.equal(withEvidence.status,'passed');
});

test('high and critical deployment views retain independent verification requirement',()=>{
 assert.equal(projectDeploymentGate({state:'staging',risk:'high',deploymentRequested:true}).independentVerificationRequired,true);
 assert.equal(projectDeploymentGate({state:'staging',risk:'critical',deploymentRequested:true}).independentVerificationRequired,true);
 assert.equal(projectDeploymentGate({state:'staging',risk:'normal',deploymentRequested:true}).independentVerificationRequired,false);
});
