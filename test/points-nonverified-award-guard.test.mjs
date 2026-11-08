import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const guard=readFileSync(new URL('../supabase/migrations/20261108224500_ekodi_points_nonverified_reward_guard.sql',import.meta.url),'utf8');
const runner=readFileSync(new URL('../scripts/run-points-sql-smokes.mjs',import.meta.url),'utf8');
const heartbeat=readFileSync(new URL('../supabase/migrations/20261030193000_ekodi_points_active_heartbeat.sql',import.meta.url),'utf8');
const evidence=readFileSync(new URL('../supabase/migrations/20261101010000_ekodi_points_evidence_anomaly.sql',import.meta.url),'utf8');

test('forward-only constraints block unverified browser time and devotional economic awards',()=>{
  assert.match(guard,/ADD CONSTRAINT ekodi_points_no_unverified_active_credit\s+CHECK \(rule_id <> 'active' OR enabled = false\)/);
  assert.match(guard,/ADD CONSTRAINT ekodi_points_no_devotion_self_report_credit\s+CHECK \(adapter <> 'devotion_self_report' OR enabled = false\)/);
  assert.match(guard,/POINTS_NONVERIFIED_REWARD_POLICY_REVIEW_REQUIRED/);
  assert.doesNotMatch(guard,/DROP TABLE|TRUNCATE|DELETE FROM|UPDATE public\.ekodi_point_|INSERT INTO public\.ekodi_point_/i);
});
test('server-side award paths still enforce their enabled policy state',()=>{
  assert.match(heartbeat,/where site_id=p_site and rule_id='active' and enabled/);
  assert.match(evidence,/where site_id=p_site and rule_id=p_rule and adapter=p_adapter and enabled/);
  assert.match(runner,/_ekodi_\(site_activity_points\|points\)_/);
});
test('isolated SQL smokes explicitly challenge enabling the forbidden policies',()=>{
  const clock=readFileSync(new URL('./points-active-heartbeat-isolated-smoke.sql',import.meta.url),'utf8');
  const claim=readFileSync(new URL('./points-evidence-anomaly-isolated-smoke.sql',import.meta.url),'utf8');
  assert.match(clock,/check_violation/);
  assert.match(clock,/ACTIVE_RULE_DISABLED/);
  assert.match(clock,/POINT_CLOCK_ISOLATED_SMOKE_PASS/);
  assert.match(claim,/devotion_self_report/);
  assert.match(claim,/check_violation/);
  assert.match(claim,/EVIDENCE_ADAPTER_DISABLED/);
  assert.match(claim,/LOW_TRUST_RULE_LIMIT/);
});
