import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { classifyMallAutonomousProfitLoop, MALL_AUTONOMOUS_PROFIT_LOOP } from '../mall-autonomous-profit-loop.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

function stages(overrides = {}) {
  return {
    source:{status:'success',fresh:true},
    feedback:{status:'success',fresh:true},
    intelligence:{status:'completed',fresh:true},
    publish:{status:'published',fresh:true,published:1,failed:0},
    ...overrides,
  };
}

test('profitable verified loop compounds only on scale/test evidence', () => {
  const result=classifyMallAutonomousProfitLoop({stages:stages(),economics:{orders30d:4,commission30dKrw:22000},topAction:'scale'});
  assert.equal(result.state,'compounding');
  assert.equal(result.nextAction,'execute:scale');
  assert.deepEqual(result.blockers,[]);
  assert.equal(MALL_AUTONOMOUS_PROFIT_LOOP.paidAdsAutonomous,false);
  assert.equal(MALL_AUTONOMOUS_PROFIT_LOOP.customerPiiLearning,false);
  assert.equal(MALL_AUTONOMOUS_PROFIT_LOOP.subject,'tenant:ekodimall');
});
test('stale feedback degrades before publishing is treated as healthy', () => {
  const result=classifyMallAutonomousProfitLoop({stages:stages({feedback:{status:'stale',fresh:false}}),economics:{orders30d:2,commission30dKrw:9000},topAction:'scale'});
  assert.equal(result.state,'degraded');
  assert.equal(result.nextAction,'refresh:feedback');
});

test('publisher gate or total publication failure blocks the loop', () => {
  const approval=classifyMallAutonomousProfitLoop({stages:stages({publish:{status:'approval_required',fresh:true,published:0,failed:0}})});
  assert.equal(approval.state,'blocked');
  assert.equal(approval.nextAction,'repair:publishing');
  const failed=classifyMallAutonomousProfitLoop({stages:stages({publish:{status:'failed',fresh:true,published:0,failed:2}})});
  assert.equal(failed.state,'blocked');
  assert.ok(failed.blockers.includes('publication_failure'));
});

test('runtime, dashboard and health share the canonical Mall tenant contract', async () => {
  const [worker,entry,dashboard,loop,workflow]=await Promise.all([
    read('marketing-growth-worker.js'),
    read('marketing-growth-entry.js'),
    read('mall-growth-dashboard.js'),
    read('mall-autonomous-profit-loop.js'),
    read('.github/workflows/deploy-marketing-growth.yml'),
  ]);
  assert.match(worker,/runMallAutonomousProfitLoop/);
  assert.match(entry,/mallAutonomousProfitLoop/);
  assert.match(dashboard,/autonomousProfitLoop/);
  assert.match(loop,/const MALL_SUBJECT_KEY = 'ekodimall'/);
  assert.match(loop,/subject_type=\? AND subject_key=\?/);
  assert.doesNotMatch(loop,/subject_key='ekodi-biz'/);
  assert.match(workflow,/mall-autonomous-profit-loop\.js/);
  assert.match(workflow,/ekodi-mall-autonomous-profit-loop\.test\.mjs/);
});
