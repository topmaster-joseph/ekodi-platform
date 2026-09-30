import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { candidateTransitionAllowed, scoreSupplierCandidate } from './supplier-discovery.js';

test('supplier discovery score rewards verified direct supplier readiness', () => {
  const score = scoreSupplierCandidate({
    discoverySource: 'public_web', businessIdentityStatus: 'confirmed', directShipStatus: 'yes', marginPercentEstimate: 22,
    stockReliability: 'high', returnsCsStatus: 'ready', pilotSupportStatus: 'yes', integrationCapability: 'api', rightsClarity: 'clear'
  });
  assert.equal(score.totalScore, 100);
  assert.equal(score.riskLevel, 'low');
  assert.equal(score.dueDiligenceReady, true);
  assert.deepEqual(score.criticalBlockers, []);
});

test('marketplace reference is never treated as a supplier merely because a URL exists', () => {
  const score = scoreSupplierCandidate({
    discoverySource: 'marketplace_reference', businessIdentityStatus: 'unknown', directShipStatus: 'unknown', marginPercentEstimate: 20,
    stockReliability: 'high', returnsCsStatus: 'ready', pilotSupportStatus: 'yes', integrationCapability: 'manual', rightsClarity: 'unknown'
  });
  assert.equal(score.dueDiligenceReady, false);
  assert.equal(score.riskLevel, 'high');
  assert.ok(score.criticalBlockers.includes('business-identity-unconfirmed'));
  assert.ok(score.criticalBlockers.includes('direct-ship-unconfirmed'));
  assert.ok(score.criticalBlockers.includes('product-rights-unconfirmed'));
});

test('candidate lifecycle cannot jump from discovery to conversion', () => {
  assert.equal(candidateTransitionAllowed('discovered', 'screening'), true);
  assert.equal(candidateTransitionAllowed('discovered', 'shortlisted'), false);
  assert.equal(candidateTransitionAllowed('screening', 'shortlisted'), true);
  assert.equal(candidateTransitionAllowed('shortlisted', 'outreach_ready'), true);
  assert.equal(candidateTransitionAllowed('outreach_ready', 'contacted'), true);
  assert.equal(candidateTransitionAllowed('contacted', 'due_diligence_ready'), true);
  assert.equal(candidateTransitionAllowed('due_diligence_ready', 'converted'), true);
  assert.equal(candidateTransitionAllowed('converted', 'screening'), false);
});

test('discovery migration separates candidate evidence, outreach and preflight snapshots without buyer PII', async () => {
  const sql = await readFile(new URL('./migrations/0009_supplier_discovery_readiness.sql', import.meta.url), 'utf8');
  for (const table of ['supplier_candidates','supplier_candidate_evidence','supplier_outreach_tasks','supplier_pilot_preflights','supplier_discovery_events']) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  assert.match(sql, /SUPPLIER_CANDIDATE_NOT_READY_FOR_CONVERSION/);
  assert.doesNotMatch(sql, /recipient_name|shipping_address|buyer_phone|phone_number/i);
});

test('hardening migration requires confirmed evidence and immutable conversion', async () => {
  const sql = await readFile(new URL('./migrations/0010_supplier_discovery_hardening.sql', import.meta.url), 'utf8');
  assert.match(sql, /SUPPLIER_CANDIDATE_CONFIRMED_EVIDENCE_REQUIRED/);
  assert.match(sql, /SUPPLIER_CANDIDATE_CONVERSION_IMMUTABLE/);
  assert.match(sql, /SUPPLIER_CANDIDATE_REJECTED_TERMINAL/);
  assert.match(sql, /SUPPLIER_PREFLIGHT_CHAIN_MISMATCH/);
  assert.match(sql, /SUPPLIER_PREFLIGHT_BLOCKERS_NOT_EMPTY/);
});

test('supplier mapping hardening rejects cross-seller product/source links', async () => {
  const sql = await readFile(new URL('./migrations/0011_supplier_mapping_seller_guard.sql', import.meta.url), 'utf8');
  assert.match(sql, /SUPPLIER_SKU_PRODUCT_SELLER_MISMATCH/);
  assert.match(sql, /PRODUCT_SOURCE_SELLER_MISMATCH/);
  assert.match(sql, /p\.seller_id = NEW\.seller_id/);
  assert.match(sql, /ss\.seller_id = NEW\.seller_id/);
});

test('discovery implementation creates outreach drafts but has no automatic send or auto-order execution', async () => {
  const source = await readFile(new URL('./supplier-discovery.js', import.meta.url), 'utf8');
  assert.match(source, /autoSent:false/);
  assert.match(source, /autoOrderEnabled:false/);
  assert.doesNotMatch(source, /gmail|sendMail|smtp|auto_order_allowed\s*=\s*1/i);
  assert.match(source, /executionAllowed:readinessStatus==='operational_ready'&&false/);
});
