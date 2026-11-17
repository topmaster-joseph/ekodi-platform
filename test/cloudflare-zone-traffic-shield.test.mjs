import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { desiredRules, mergeRules } from '../scripts/cloudflare-zone-traffic-shield.mjs';

test('zone rules fit the Free plan and stay NAT-safe', () => {
  const { http_ratelimit: [rate], http_request_firewall_custom: custom } = desiredRules();
  assert.deepEqual(rate.ratelimit.characteristics, ['cf.colo.id', 'ip.src']);
  assert.equal(rate.ratelimit.period, 10);
  assert.equal(rate.ratelimit.mitigation_timeout, 10);
  assert.ok(rate.ratelimit.requests_per_period >= 3000, 'classroom behind one NAT must not be blocked');
  assert.ok(custom.length <= 5);
  for (const rule of [rate, ...custom]) assert.match(rule.ref, /^ekodi_edge_/);
  const scanner = custom.find(rule => rule.ref === 'ekodi_edge_block_scanner_paths').expression;
  assert.match(scanner, /wp-login\.php/);
  assert.doesNotMatch(scanner, /well-known|\/admin"|\/api/, 'never blocks EKODI paths');
});

test('merge keeps foreign rules and replaces only EKODI-owned ones', () => {
  const existing = [{ id: 'x', ref: 'owner_manual', expression: 'true', action: 'skip', enabled: true, version: '3' }, { ref: 'ekodi_edge_old', expression: 'false', action: 'block' }];
  const merged = mergeRules(existing, [{ ref: 'ekodi_edge_new', expression: 'true', action: 'block', enabled: true }]);
  assert.deepEqual(merged.map(rule => rule.ref), ['owner_manual', 'ekodi_edge_new']);
  assert.equal(merged[0].id, undefined, 'server-assigned fields are not echoed');
});

test('script only writes when --apply is passed', () => {
  assert.match(readFileSync('scripts/cloudflare-zone-traffic-shield.mjs', 'utf8'), /if \(!apply\) \{ console\.log\('  plan only/);
});

test('apply is manual, main-only; push only plans', () => {
  const wf = readFileSync('.github/workflows/cloudflare-zone-traffic-shield.yml', 'utf8');
  assert.match(wf, /test "\$GITHUB_REF" = 'refs\/heads\/main'/);
  assert.match(wf, /if: github\.event_name == 'workflow_dispatch' && inputs\.mode == 'apply'\n\s+run: node scripts\/cloudflare-zone-traffic-shield\.mjs --apply/);
});
