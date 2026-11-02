import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildPointProgress, kstDate } from '../supabase/functions/points-api/progress.mjs';

const adapter = (rule_id, adapter, trust = 'verified') =>
  ({ rule_id, adapter, trust, member_claimable: true, enabled: true });
const claim = (status, submitted_at, rule_id = 'learn', adapter = 'content_approval') =>
  ({ rule_id, adapter, status, submitted_at });
const rules = [{ rule_id: 'learn', points: 20, enabled: true }];
const adapters = [adapter('learn', 'content_approval')];
const now = '2026-11-03T00:30:00+09:00';

test('KST day boundary is independent of UTC day', () => {
  assert.equal(kstDate('2026-11-02T14:59:59Z'), '2026-11-02');
  assert.equal(kstDate('2026-11-02T15:00:00Z'), '2026-11-03');
  assert.equal(kstDate('invalid'), null);
});

test('only approved verified activities count towards non-financial recognition', () => {
  const result = buildPointProgress({
    now, adapters: [
      ...adapters,
      adapter('report', 'devotion_self_report', 'low_trust'),
      adapter('attendance', 'attendance_checkin'),
      adapter('visit', 'content_approval', 'low_trust'),
    ],
    rules: [...rules,
      { rule_id: 'report', points: 5, enabled: true },
      { rule_id: 'attendance', points: 10, enabled: true },
      { rule_id: 'visit', points: 10, enabled: true },
    ],
    claims: [
      claim('approved', '2026-11-02T15:20:00Z'),
      claim('pending', '2026-11-02T15:45:00Z'),
      claim('approved', '2026-11-02T16:00:00Z', 'attendance', 'attendance_checkin'),
      claim('approved', '2026-11-02T17:00:00Z', 'visit', 'content_approval'),
    ],
  });
  assert.equal(result.reward_policy, 'recognition_only');
  assert.equal(result.level.verified_activities_90d, 1);
  assert.equal(result.level.id, 'seed');
  assert.equal(result.missions.length, 1);
  assert.equal(result.missions[0].today_status, 'completed');
  assert.equal(result.missions[0].points_if_approved, 20);
});

test('three consecutive KST days are counted once each despite repeated approvals', () => {
  const result = buildPointProgress({
    now, adapters, rules, claims: [
      claim('approved', '2026-11-01T04:00:00Z'),
      claim('approved', '2026-11-02T08:00:00Z'),
      claim('approved', '2026-11-02T09:00:00Z'),
      claim('approved', '2026-11-02T18:00:00Z'),
    ],
  });
  assert.equal(result.streak.current_days, 3);
  assert.equal(result.streak.longest_days_90d, 3);
  assert.equal(result.level.id, 'companion');
});

test('yesterday retains streak, future and rejected claims do not create a streak', () => {
  const result = buildPointProgress({
    now, adapters, rules, claims: [
      claim('approved', '2026-11-01T04:00:00Z'),
      claim('approved', '2026-11-02T08:00:00Z'),
      claim('rejected', '2026-11-02T17:00:00Z'),
      claim('approved', '2026-11-04T04:00:00Z'),
    ],
  });
  assert.equal(result.streak.current_days, 2);
  assert.equal(result.streak.longest_days_90d, 2);
  assert.equal(result.missions[0].today_status, 'available');
});

test('disabled and non-claimable adapters never become user missions', () => {
  const result = buildPointProgress({
    now,
    adapters: [{ ...adapter('learn', 'content_approval'), member_claimable: false },
      { ...adapter('other', 'meeting_participation'), enabled: false }],
    rules: [...rules, { rule_id: 'other', points: 15, enabled: true }],
    claims: [claim('approved', '2026-11-02T16:00:00Z')],
    truncated: true,
  });
  assert.deepEqual(result.missions, []);
  assert.equal(result.level.verified_activities_90d, 0);
  assert.equal(result.complete_window, false);
});

test('progress route is read-only, scoped to Person and enabled site, and hides evidence', () => {
  const src = fs.readFileSync(new URL('../supabase/functions/points-api/index.ts', import.meta.url), 'utf8');
  assert.match(src, /path === "\/progress"/);
  assert.match(src, /\.eq\("person_id", personId\)/);
  assert.match(src, /\.eq\("site_id", site\)/);
  assert.match(src, /\.eq\("enabled", true\)/);
  assert.match(src, /\.eq\("trust", "verified"\)/);
  assert.match(src, /\.select\("rule_id,adapter,status,submitted_at"\)/);
  assert.doesNotMatch(src, /\.insert\(|\.update\(|\.delete\(|\.rpc\(/);
});
