import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFreeTierResourceGovernor, evaluateResourceMetric, FREE_TIER_RESOURCE_CATALOG } from '../free-tier-resource-governor.js';

const NOW=Date.parse('2026-09-20T08:00:00.000Z');

test('Supabase project capacity blocks only new projects at 2/2',()=>{
  const governor=buildFreeTierResourceGovernor({
    now:NOW,
    snapshots:[{
      provider:'supabase',metric:'active_projects',period_start:'2026-09',
      observed_value:2,free_limit:2,source:'supabase-management-api',observed_at:'2026-09-20T07:30:00.000Z'
    }]
  });
  const supabase=governor.providers.supabase;
  assert.equal(supabase.state,'normal');
  assert.equal(supabase.provisioningAllowed,false);
  assert.deepEqual(supabase.capacityBlocks,['active_projects']);
  assert.equal(supabase.metrics[0].state,'capacity_full');
  assert.equal(supabase.metrics[0].action,'block_new_resource');
});

test('measured Supabase database size uses the per-project 500MB limit without affecting other projects',()=>{
  const metric=evaluateResourceMetric({
    provider:'supabase',metric:'database_bytes:renzehysxirjilvdxacv',
    observed_value:23325843,source:'postgres-pg_database_size',observed_at:'2026-09-20T07:30:00.000Z'
  },{now:NOW});
  assert.equal(metric.freeLimit,500*1024*1024);
  assert.equal(metric.state,'normal');
  assert.ok(metric.usagePercent>4&&metric.usagePercent<5);
});

test('stale or missing telemetry never fabricates a current usage percentage',()=>{
  const stale=evaluateResourceMetric({
    provider:'supabase',metric:'mau_month',observed_value:1000,free_limit:50000,
    source:'test',observed_at:'2026-09-17T00:00:00.000Z'
  },{now:NOW,staleAfterHours:26});
  assert.equal(stale.stale,true);
  const governor=buildFreeTierResourceGovernor({now:NOW,staleAfterHours:26,snapshots:[{
    provider:'supabase',metric:'mau_month',observed_value:1000,free_limit:50000,
    source:'test',observed_at:'2026-09-17T00:00:00.000Z'
  }]});
  assert.equal(governor.providers.supabase.highestUsagePercent,null);
  assert.equal(governor.providers.supabase.telemetryStatus,'missing');
  assert.equal(governor.providers.supabase.provisioningAllowed,false);
  assert.deepEqual(governor.providers.supabase.capacityTelemetryMissing,['active_projects']);
  assert.deepEqual(governor.providers.supabase.provisioningBlockReasons,['capacity_telemetry_missing:active_projects']);
});

test('runtime quota pressure blocks nonessential work while capacity remains a separate concern',()=>{
  const governor=buildFreeTierResourceGovernor({
    now:NOW,
    snapshots:[
      {provider:'cloudflare',metric:'workers_requests_daily',observed_value:91000,free_limit:100000,source:'workers-usage',observed_at:'2026-09-20T07:30:00.000Z'},
      {provider:'supabase',metric:'active_projects',observed_value:2,free_limit:2,source:'management-api',observed_at:'2026-09-20T07:30:00.000Z'},
    ]
  });
  assert.equal(governor.providers.cloudflare.state,'protect');
  assert.equal(governor.providers.cloudflare.action,'block_nonessential');
  assert.equal(governor.providers.supabase.provisioningAllowed,false);
  assert.equal(governor.providers.supabase.action,'normal');
});

test('verified catalog keeps public GitHub runners free and storage plan-aware',()=>{
  assert.equal(FREE_TIER_RESOURCE_CATALOG.github.facts.publicRepositoryStandardHostedRunners,'free');
  assert.equal(FREE_TIER_RESOURCE_CATALOG.github.facts.artifactStorage,'plan-dependent');
  assert.equal(FREE_TIER_RESOURCE_CATALOG.supabase.metrics.find(x=>x.metric==='active_projects').freeLimit,2);
});


test('stale Supabase capacity telemetry blocks only new provisioning until refreshed',()=>{
  const governor=buildFreeTierResourceGovernor({
    now:NOW,
    staleAfterHours:26,
    snapshots:[{
      provider:'supabase',metric:'active_projects',period_start:'2026-09-18',
      observed_value:1,free_limit:2,source:'supabase-management-api',observed_at:'2026-09-18T00:00:00.000Z'
    }]
  });
  const supabase=governor.providers.supabase;
  assert.equal(supabase.state,'normal');
  assert.equal(supabase.provisioningAllowed,false);
  assert.deepEqual(supabase.capacityTelemetryMissing,['active_projects']);
  assert.deepEqual(supabase.capacityBlocks,[]);
  assert.equal(supabase.telemetryStatus,'missing');
});
