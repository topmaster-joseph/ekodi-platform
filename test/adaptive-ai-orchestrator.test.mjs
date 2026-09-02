import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveAdaptiveAiPlan,
  runAdaptiveAiTask,
  resetAdaptiveAiCircuitsForTest,
} from '../adaptive-ai-orchestrator.js';

test('adaptive policy keeps routine work on one provider', () => {
  const plan = resolveAdaptiveAiPlan({ providerCount:4, taskName:'short-answer', context:{ message:'상태 알려줘' } });
  assert.equal(plan.strategy, 'single');
  assert.equal(plan.fanout, 1);
});

test('adaptive policy cross-checks material and high-impact analysis', () => {
  const material = resolveAdaptiveAiPlan({ providerCount:4, taskName:'architecture-review', context:{ message:'구조를 검토하고 대안을 비교해줘' } });
  assert.equal(material.strategy, 'parallel');
  assert.equal(material.fanout, 2);
  const high = resolveAdaptiveAiPlan({ providerCount:4, taskName:'production-release', context:{ message:'운영 배포 전 보안과 롤백을 검증해줘' } });
  assert.equal(high.strategy, 'parallel');
  assert.equal(high.fanout, 3);
  assert.equal(high.quorum, 2);
});

test('privacy-first routing avoids provider fanout for sensitive input', () => {
  const plan = resolveAdaptiveAiPlan({ providerCount:4, taskName:'review', context:{ message:'API 키와 토큰 원문을 검토해줘' } });
  assert.equal(plan.strategy, 'single');
  assert.equal(plan.reason, 'privacy_first_single_provider');
});
test('parallel reviews run concurrently and are synthesized', async () => {
  resetAdaptiveAiCircuitsForTest();
  let active = 0;
  let maxActive = 0;
  const phases = [];
  const provider = id => ({
    id,
    available:true,
    async invoke({ context }) {
      const meta = context._ekodiOrchestration || {};
      phases.push(`${id}:${meta.phase}`);
      if (meta.phase === 'synthesis') {
        assert.equal(meta.peerReviews.length, 2);
        return { text:'통합 결과', model:`${id}-model` };
      }
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise(resolve => setTimeout(resolve, 25));
      active -= 1;
      return { text:`${id} 독립 검토`, model:`${id}-model` };
    },
  });
  const plan = resolveAdaptiveAiPlan({ providerCount:2, taskName:'release-review', context:{ message:'운영 배포를 교차검증해줘' } });
  const result = await runAdaptiveAiTask({ providers:[provider('a'),provider('b')], taskName:'release-review', context:{ message:'운영 배포를 교차검증해줘' }, plan, fallback:() => 'fallback', timeoutMs:500 });
  assert.equal(result.ok, true);
  assert.equal(result.provider, 'ekodi-orchestrator');
  assert.equal(result.value.text, '통합 결과');
  assert.equal(result.orchestration.synthesized, true);
  assert.equal(result.orchestration.quorumMet, true);
  assert.equal(maxActive, 2);
  assert.ok(phases.includes('a:synthesis'));
});
test('parallel orchestration degrades safely when quorum is not met', async () => {
  resetAdaptiveAiCircuitsForTest();
  const good = { id:'good', available:true, invoke:async () => ({ text:'검토 가능' }) };
  const bad = { id:'bad', available:true, invoke:async () => { throw new Error('down'); } };
  const plan = { strategy:'parallel', fanout:2, quorum:2, synthesize:true, reason:'test' };
  const result = await runAdaptiveAiTask({ providers:[good,bad], taskName:'review', context:{}, plan, fallback:() => 'fallback', timeoutMs:100 });
  assert.equal(result.ok, true);
  assert.equal(result.provider, 'good');
  assert.equal(result.degraded, true);
  assert.equal(result.orchestration.quorumMet, false);
  assert.deepEqual(result.orchestration.failedProviders, ['bad']);
});

test('parallel plan keeps a surviving AI before falling back to core', async () => {
  resetAdaptiveAiCircuitsForTest();
  const only = { id:'only', available:true, invoke:async () => ({ text:'단일 AI 축소 응답' }) };
  const plan = { strategy:'parallel', fanout:3, quorum:2, synthesize:true, reason:'high_impact_cross_check' };
  const result = await runAdaptiveAiTask({ providers:[only], taskName:'review', context:{}, plan, fallback:() => 'core fallback', timeoutMs:100 });
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'ai');
  assert.equal(result.provider, 'only');
  assert.equal(result.degraded, true);
  assert.equal(result.value.text, '단일 AI 축소 응답');
  assert.equal(result.orchestration.quorumMet, false);
});
