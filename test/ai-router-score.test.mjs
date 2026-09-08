import test from 'node:test';
import assert from 'node:assert/strict';
import {AI_ROUTER_SCORE_POLICY,inferTaskTraits,rankProviders,scoreProvider} from '../ai-router-score.js';
import {buildExecutionPlan,normalizeTaskInput} from '../ai-control-core.js';

test('router score weights are normalized and auditable',()=>{
  const total=Object.values(AI_ROUTER_SCORE_POLICY.weights).reduce((sum,value)=>sum+value,0);
  assert.equal(Number(total.toFixed(8)),1);
  const rating=scoreProvider('gemini-free',normalizeTaskInput({prompt:'summarize this memo',mode:'single'}));
  assert.ok(rating.score>=0&&rating.score<=100);
  assert.equal(rating.policyVersion,AI_ROUTER_SCORE_POLICY.version);
  assert.deepEqual(Object.keys(rating.breakdown).sort(),['cost','health','latency','load','quality','reliability','taskFit'].sort());
});

test('code work keeps the origin lane and ranks repository-capable nodes first among collaborators',()=>{
  const task=normalizeTaskInput({prompt:'fix this repository code, run tests, and prepare deployment',mode:'single'});
  assert.equal(inferTaskTraits(task).category,'code');
  const plan=buildExecutionPlan(task,{geminiFree:true,nodeProviders:['codex','gemini-cli'],openaiApi:true});
  assert.equal(plan[0].providerId,'node:codex');
  assert.equal(plan[0].role,'origin-primary');
  assert.equal(plan[1].providerId,'node:gemini-cli');
  assert.equal(plan[1].routerScorePolicyVersion,AI_ROUTER_SCORE_POLICY.version);
});

test('strong failure history demotes an otherwise preferred provider',()=>{
  const task=normalizeTaskInput({prompt:'analyze current operating notes',mode:'single'});
  const ranked=rankProviders(['gemini-free','openai-api'],task,{providerMetrics:{
    'gemini-free':{totalRuns:20,successfulRuns:3,recentRuns:10,recentFailures:8,averageLatencyMs:8000,activeRuns:1},
    'openai-api':{totalRuns:20,successfulRuns:19,recentRuns:10,recentFailures:0,averageLatencyMs:8000,activeRuns:0},
  }});
  assert.equal(ranked[0].providerId,'openai-api');
  assert.ok(ranked[0].score>ranked[1].score);
});

test('load and latency affect collaborator ranking without bypassing availability',()=>{
  const task=normalizeTaskInput({prompt:'compare two policy drafts',mode:'single'});
  const context={providerMetrics:{
    'gemini-free':{totalRuns:20,successfulRuns:18,recentRuns:5,recentFailures:0,averageLatencyMs:120000,activeRuns:8},
    'openai-api':{totalRuns:20,successfulRuns:18,recentRuns:5,recentFailures:0,averageLatencyMs:3000,activeRuns:0},
  }};
  const ranked=rankProviders(['gemini-free','openai-api'],task,context);
  assert.equal(ranked[0].providerId,'openai-api');
  const unavailable=buildExecutionPlan(task,{geminiFree:true,openaiApi:false,providerMetrics:context.providerMetrics});
  assert.deepEqual(unavailable.map(item=>item.providerId),['gemini-free']);
});

test('origin governance stays first while explicit collaborator order is preserved',()=>{
  const task=normalizeTaskInput({prompt:'analyze this',mode:'primary-review',providers:['openai-api','gemini-free'],origin:{provider:'claude'}});
  const plan=buildExecutionPlan(task,{geminiFree:true,openaiApi:true,workerProviders:['claude'],providerMetrics:{
    'openai-api':{totalRuns:20,successfulRuns:2,recentRuns:10,recentFailures:8},
    'gemini-free':{totalRuns:20,successfulRuns:20,recentRuns:10,recentFailures:0},
  }});
  assert.deepEqual(plan.map(item=>item.providerId),['worker:claude','openai-api','gemini-free']);
  assert.equal(plan[0].role,'origin-primary');
});

test('provider profile overrides can tune task fit without code changes',()=>{
  const task=normalizeTaskInput({prompt:'research the evidence and compare findings',mode:'single'});
  const ranked=rankProviders(['gemini-free','worker:specialist'],task,{providerProfiles:{
    'worker:specialist':{costClass:'provider-managed',skills:{analysis:1}},
  }});
  assert.equal(ranked[0].providerId,'worker:specialist');
});
