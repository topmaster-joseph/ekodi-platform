import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  FREE_TIER_THRESHOLDS,
  evaluateFreeTierQuota,
  freeTierState,
  providerFreeTierPreference,
  shouldStopRetry,
} from '../free-tier-quota-guard.js';

test('free-tier states preserve 70/85/90/95/100 protection ladder', () => {
  assert.deepEqual(FREE_TIER_THRESHOLDS,{warning:70,conserve:85,protect:90,survival:95,circuitBreaker:100});
  assert.equal(freeTierState(69.9),'normal');
  assert.equal(freeTierState(70),'warning');
  assert.equal(freeTierState(85),'conserve');
  assert.equal(freeTierState(90),'protect');
  assert.equal(freeTierState(95),'survival');
  assert.equal(freeTierState(100),'circuit_breaker');
});

test('Cloudflare 1027 and generic 429 stop retry immediately', () => {
  assert.equal(shouldStopRetry(1027),true);
  assert.equal(shouldStopRetry(429),true);
  assert.equal(evaluateFreeTierQuota({percent:20,errorCode:1027}).retryStop,true);
  assert.equal(evaluateFreeTierQuota({percent:20,errorCode:429}).allowed,false);
});

test('90 percent protects quota by blocking nonessential work while preserving essential path', () => {
  const nonessential=evaluateFreeTierQuota({percent:90,essential:false});
  const essential=evaluateFreeTierQuota({percent:90,essential:true});
  assert.equal(nonessential.action,'block_nonessential');
  assert.equal(nonessential.allowed,false);
  assert.equal(essential.allowed,true);
  assert.equal(essential.preserveSecurityBoundary,true);
});

test('free-tier provider preferences keep provider responsibilities separated', () => {
  assert.ok(providerFreeTierPreference('cloudflare').includes('static-assets'));
  assert.ok(providerFreeTierPreference('supabase').includes('rls'));
  assert.ok(providerFreeTierPreference('github').includes('public-hosted-actions'));
});

test('admin cost control exposes the free-tier guard and additive provider quota ledger exists', async () => {
  const [control,migration]=await Promise.all([
    readFile('api-cost-control.js','utf8'),
    readFile('migrations/0099_free_tier_provider_quota.sql','utf8'),
  ]);
  assert.match(control,/EKODI-FREE-TIER-001/);
  assert.match(control,/FREE_TIER_RETRY_STOP_SIGNALS/);
  assert.match(migration,/provider_quota_snapshots/);
  assert.match(migration,/provider_quota_state/);
});
