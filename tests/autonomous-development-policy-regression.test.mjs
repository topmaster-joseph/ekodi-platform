import test from 'node:test';
import assert from 'node:assert/strict';
import {planDevelopmentTask,transitionDevelopmentTask,retryDecision} from '../ekodi-autonomous-development-policy.js';
const task=()=>planDevelopmentTask({id:'task_1',idempotencyKey:'unique_1'});
test('identity validation',()=>assert.throws(()=>planDevelopmentTask({id:'x'})));
test('queued initial state',()=>assert.equal(task().state,'queued'));
test('invalid transition',()=>assert.throws(()=>transitionDevelopmentTask(task(),'complete')));
test('approval gate',()=>{
 const t={...planDevelopmentTask({id:'t',idempotencyKey:'k',changeClass:'secrets'}),state:'pull_request'};
 assert.throws(()=>transitionDevelopmentTask(t,'staging'));
 assert.equal(transitionDevelopmentTask(t,'staging',{approved:true}).state,'staging');
});
test('verification gate',()=>{
 const t={...task(),state:'production_verification'};
 assert.throws(()=>transitionDevelopmentTask(t,'complete'));
 assert.equal(transitionDevelopmentTask(t,'complete',{productionVerified:true,releaseSha:'abc',functionalCheckPassed:true}).state,'complete');
});
test('retry limit',()=>assert.equal(retryDecision({...task(),attempts:1},{},0).state,'blocked'));
