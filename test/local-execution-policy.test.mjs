import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LOCAL_EXECUTION_POLICY,
  compareLocalExecutionCandidates,
  localExecutionPolicySnapshot,
  localExecutionScore,
  normalizeLocalResource,
} from '../local-execution-policy.js';

test('local execution remains Cloud First and least-loaded parallel', () => {
  const snapshot=localExecutionPolicySnapshot();
  assert.equal(snapshot.cloudFirst,true);
  assert.equal(snapshot.localFallbackOnly,true);
  assert.equal(snapshot.strategy,'least_loaded_parallel');
  assert.equal(snapshot.parallelDistribution,true);
  assert.equal(LOCAL_EXECUTION_POLICY.portableAutoExecution,false);
});

test('resource normalization fails closed for portable or unknown hardware', () => {
  assert.equal(normalizeLocalResource({isPortable:true,autoExecutionEligible:true}).autoExecutionEligible,false);
  assert.equal(normalizeLocalResource({cpuLoadPct:10,memoryUsedPct:20}).autoExecutionEligible,false);
  const desktop=normalizeLocalResource({cpuLoadPct:20,memoryUsedPct:42,isPortable:false,autoExecutionEligible:true});
  assert.equal(desktop.currentLoad,42);
  assert.equal(desktop.autoExecutionEligible,true);
});

test('scheduler score balances machine load with active concurrency', () => {
  assert.equal(localExecutionScore({currentLoad:20,activeJobs:0,maxConcurrency:2}),20);
  assert.equal(localExecutionScore({currentLoad:20,activeJobs:1,maxConcurrency:2}),70);
  const nodes=[
    {id:'busy',currentLoad:15,activeJobs:1,maxConcurrency:1,lastSeenAt:'2026-09-13T00:00:00Z'},
    {id:'free',currentLoad:35,activeJobs:0,maxConcurrency:1,lastSeenAt:'2026-09-13T00:00:00Z'},
  ];
  nodes.sort(compareLocalExecutionCandidates);
  assert.equal(nodes[0].id,'free');
});

test('parallel jobs spread once the first node gains active work', () => {
  const nodes=[
    {id:'a',currentLoad:10,activeJobs:0,maxConcurrency:1},
    {id:'b',currentLoad:25,activeJobs:0,maxConcurrency:1},
  ];
  nodes.sort(compareLocalExecutionCandidates);
  assert.equal(nodes[0].id,'a');
  nodes[0].activeJobs=1;
  nodes.sort(compareLocalExecutionCandidates);
  assert.equal(nodes[0].id,'b');
});
