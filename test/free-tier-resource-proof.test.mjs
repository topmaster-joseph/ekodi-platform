import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWranglerD1Proof, evaluateMeasuredProof, formatProofSummary } from '../scripts/evaluate-free-tier-resource-proof.mjs';

const NOW=Date.parse('2026-09-27T05:48:00.000Z');
const rows=[
  {provider:'github',metric:'cache_storage_bytes',observed_value:3491,free_limit:10737418240,source:'github-rest-cache-usage',observed_at:'2026-09-27T05:47:05.746Z'},
  {provider:'github',metric:'artifact_storage_bytes',observed_value:217106941,free_limit:null,source:'github-rest-artifacts',observed_at:'2026-09-27T05:47:05.746Z'},
  {provider:'supabase',metric:'storage_bytes_org:ekodi-free-org',observed_value:33132,free_limit:1073741824,source:'supabase-edge-github-oidc',observed_at:'2026-09-27T05:47:05.746Z'},
  {provider:'supabase',metric:'database_bytes:renzehysxirjilvdxacv',observed_value:24267923,free_limit:524288000,source:'supabase-edge-github-oidc',observed_at:'2026-09-27T05:47:05.746Z'},
  {provider:'supabase',metric:'database_bytes:lxcxwbdwwojjkgybbqii',observed_value:12209299,free_limit:524288000,source:'supabase-edge-github-oidc',observed_at:'2026-09-27T05:47:05.746Z'},
  {provider:'supabase',metric:'active_projects',observed_value:2,free_limit:2,source:'supabase-edge-github-oidc',observed_at:'2026-09-27T05:47:05.746Z'},
];

test('parses Wrangler D1 JSON batches',()=>{
  const parsed=parseWranglerD1Proof([{results:rows},{results:[]}]);
  assert.equal(parsed.length,rows.length);
});

test('closed-loop proof blocks new Supabase projects at measured 2/2 capacity',()=>{
  const proof=evaluateMeasuredProof(rows,{now:NOW});
  assert.equal(proof.automaticPaidUpgrade,false);
  assert.equal(proof.supabase.activeProjects.observedValue,2);
  assert.equal(proof.supabase.activeProjects.freeLimit,2);
  assert.equal(proof.supabase.activeProjects.state,'capacity_full');
  assert.equal(proof.supabase.provisioningAllowed,false);
  assert.deepEqual(proof.supabase.capacityBlocks,['active_projects']);
  assert.equal(proof.supabase.databaseMetrics.length,2);
  assert.equal(proof.github.telemetryStatus,'measured');
  assert.equal(proof.github.cacheStorage.state,'normal');
});

test('closed-loop proof fails when measured provider telemetry is stale',()=>{
  assert.throws(()=>evaluateMeasuredProof(rows,{now:Date.parse('2026-09-30T05:48:00.000Z'),staleAfterHours:26}),/SUPABASE_TELEMETRY_MUST_BE_FRESH/);
});

test('summary exposes capacity decision without exposing secrets',()=>{
  const proof=evaluateMeasuredProof(rows,{now:NOW});
  const summary=formatProofSummary(proof);
  assert.match(summary,/active_projects=2\/2/);
  assert.match(summary,/provisioning_allowed=false/);
  assert.doesNotMatch(summary,/token|secret|authorization/i);
});
