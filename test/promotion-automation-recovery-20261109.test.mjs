import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { scorePromotionLearning, DORMANCY_TEST_DAYS } from '../mall-promotion-automation.js';
import { runScheduledMetricsCollection, vaultCapable } from '../marketing-metrics-collector.js';

const weak = { opportunityScore:40, recommendedAction:'hold', selectionScore:60, visits30d:15, outboundClicks30d:0 };

test('weak-signal products stay on hold while the channel posted recently', () => {
  const r = scorePromotionLearning({ ...weak, daysSinceLastPost:1 });
  assert.equal(r.action, 'hold');
});

test(`a channel dormant for ${DORMANCY_TEST_DAYS}+ days reopens one test post (deadlock breaker)`, () => {
  const r = scorePromotionLearning({ ...weak, daysSinceLastPost:6 });
  assert.equal(r.action, 'test');
  assert.equal(r.reason, 'dormancy_exploration');
  assert.equal(scorePromotionLearning({ ...weak, daysSinceLastPost:null }).action, 'test', 'never posted counts as dormant');
});

test('dormancy never overrides a high-cancellation hold or a zero-opportunity product', () => {
  assert.equal(scorePromotionLearning({ ...weak, orders30d:4, cancels30d:3, daysSinceLastPost:9 }).action, 'hold');
  assert.equal(scorePromotionLearning({ ...weak, opportunityScore:0, daysSinceLastPost:9 }).action, 'hold');
  assert.equal(scorePromotionLearning({ ...weak, opportunityScore:90, outboundClicks30d:5, productClicks30d:5, commission30d:5000, recommendedAction:'scale', daysSinceLastPost:9 }).action, 'scale', 'strong signals keep their own action');
});

test('metrics collection without vault secrets does not run or claim the 6-hour slot', async () => {
  let touched = false;
  const env = { DB: { prepare: () => { touched = true; throw new Error('should not query'); } } };
  assert.equal(vaultCapable(env), false);
  const r = await runScheduledMetricsCollection(env, { now: Date.parse('2026-11-09T03:00:00Z') });
  assert.deepEqual(r, { ran:false, reason:'VAULT_SECRETS_UNAVAILABLE' });
  assert.equal(touched, false);
  assert.equal(vaultCapable({ META_APP_SECRET:'x' }), true);
});

test('the growth worker (which holds the vault secrets) runs metrics collection in its shared cycle', () => {
  const src = fs.readFileSync(new URL('../marketing-growth-worker.js', import.meta.url), 'utf8');
  assert.match(src, /import \{ runScheduledMetricsCollection \} from '\.\/marketing-metrics-collector\.js';/);
  assert.match(src, /const metrics = await runScheduledMetricsCollection\(this\.env\)/);
  const deploy = fs.readFileSync(new URL('../.github/workflows/deploy-marketing-growth.yml', import.meta.url), 'utf8');
  assert.match(deploy, /META_APP_SECRET: \$\{\{ secrets\.META_APP_SECRET \}\}/);
});
