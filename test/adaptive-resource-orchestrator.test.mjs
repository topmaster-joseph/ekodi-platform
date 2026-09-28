import test from 'node:test';
import assert from 'node:assert/strict';
import {
  adaptiveModeFromUsagePercent,
  adaptiveModeFromBurnRate,
  buildAdaptiveInfrastructureDecision,
  classifyServiceCriticality,
  metricBurnRate,
  serviceActionForMode
} from '../adaptive-resource-orchestrator.js';

test('usage thresholds map to NORMAL SAVE PROTECT SURVIVE',()=>{
  assert.equal(adaptiveModeFromUsagePercent(59.99),'normal');
  assert.equal(adaptiveModeFromUsagePercent(60),'save');
  assert.equal(adaptiveModeFromUsagePercent(74.99),'save');
  assert.equal(adaptiveModeFromUsagePercent(75),'protect');
  assert.equal(adaptiveModeFromUsagePercent(89.99),'protect');
  assert.equal(adaptiveModeFromUsagePercent(90),'survive');
});

test('burn rate escalates before absolute usage when consumption is too fast',()=>{
  assert.equal(adaptiveModeFromBurnRate(0.69,{usagePercent:20}),'normal');
  assert.equal(adaptiveModeFromBurnRate(0.7,{usagePercent:20}),'save');
  assert.equal(adaptiveModeFromBurnRate(1,{usagePercent:20}),'protect');
  assert.equal(adaptiveModeFromBurnRate(1.5,{usagePercent:20}),'survive');
  assert.equal(adaptiveModeFromBurnRate(5,{usagePercent:1.5}),'normal');
});

test('monthly burn rate compares usage fraction with elapsed period fraction',()=>{
  const now=Date.parse('2026-09-16T00:00:00Z');
  const rate=metricBurnRate({metric:'workers_requests_month',usagePercent:40},{now});
  assert.ok(rate>0.75&&rate<0.85, String(rate));
});

test('adaptive decision uses the strongest measured pressure signal',()=>{
  const now=Date.parse('2026-09-16T00:00:00Z');
  const decision=buildAdaptiveInfrastructureDecision({
    now,
    metrics:[
      {metric:'workers_requests_month',usagePercent:40,measured:true,stale:false,scope:'consumption'},
      {metric:'d1_rows_read_month',usagePercent:10,measured:true,stale:false,scope:'consumption'}
    ]
  });
  assert.equal(decision.mode,'save');
  assert.equal(decision.reasons.usageMode,'normal');
  assert.equal(decision.reasons.burnRateMode,'save');
  assert.equal(decision.cacheProfile,'aggressive-safe');
  assert.equal(decision.readPath,'cdn-r2-snapshot-first');
  assert.equal(decision.blockNonessential,false);
});

test('runtime error latency or traffic spike can protect the platform independently',()=>{
  const decision=buildAdaptiveInfrastructureDecision({metrics:[],runtimeSignals:{errorRatePercent:5.1}});
  assert.equal(decision.mode,'protect');
  assert.equal(decision.blockNonessential,true);
});

test('S0 always stays direct and never receives stale or auxiliary production fallback',()=>{
  for(const mode of ['normal','save','protect','survive']){
    const action=serviceActionForMode('auth',mode);
    assert.equal(action.criticality,'S0');
    assert.equal(action.staleFallbackAllowed,false);
    assert.equal(action.auxiliaryProductionExecutionAllowed,false);
  }
  assert.equal(serviceActionForMode('auth','survive').action,'live-direct-fail-closed');
});

test('noncritical work degrades gracefully before critical services',()=>{
  assert.equal(classifyServiceCriticality('marketing-analytics'),'S2');
  assert.equal(classifyServiceCriticality('preview-generation'),'S3');
  assert.equal(serviceActionForMode('marketing-analytics','save').action,'snapshot-first');
  assert.equal(serviceActionForMode('preview-generation','protect').action,'paused');
  assert.equal(serviceActionForMode('/admin','protect').criticality,'S1');
});

test('current low paid usage remains normal instead of overreacting',()=>{
  const now=Date.parse('2026-09-28T07:23:18Z');
  const decision=buildAdaptiveInfrastructureDecision({
    now,
    metrics:[
      {metric:'workers_requests_month',usagePercent:16.5,measured:true,stale:false,scope:'consumption'},
      {metric:'d1_rows_read_month',usagePercent:0.3,measured:true,stale:false,scope:'consumption'},
      {metric:'d1_rows_written_month',usagePercent:2.1,measured:true,stale:false,scope:'consumption'}
    ]
  });
  assert.equal(decision.mode,'normal');
  assert.ok(decision.highestBurnRate<0.7);
  assert.equal(decision.blockNonessential,false);
});
