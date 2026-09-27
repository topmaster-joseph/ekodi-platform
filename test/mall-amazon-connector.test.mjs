import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { amazonConnectorStatus, evaluateAmazonCostPolicy, handleAmazonRequest } from '../sites/ekodi-mall/api/amazon.js';

test('Amazon connector keeps secrets server-side and exposes canonical readiness', () => {
  const status = amazonConnectorStatus({
    AMAZON_SP_API_CLIENT_ID:'client',
    AMAZON_SP_API_CLIENT_SECRET:'secret',
    AMAZON_SP_API_REFRESH_TOKEN:'refresh',
    AMAZON_MARKETPLACE_ID:'A1VC38T7YXB528',
    AMAZON_SELLER_ID:'seller'
  });
  assert.equal(status.provider,'amazon');
  assert.equal(status.sellerCentral.configured,true);
  assert.equal(status.policy.canonicalAdminPath,'/ekodimall/admin/amazon');
  assert.equal(status.AMAZON_SP_API_CLIENT_SECRET,undefined);
  assert.equal(status.sellerCentral.sellerId,undefined);
  assert.equal(status.policy.freeFirstDefault,true);
  assert.ok(status.sellerCentral.resources.includes('orders'));
  assert.ok(status.sellerCentral.resources.includes('fulfillment'));
});

test('free-first policy permits zero-cost work and blocks paid work by default', async () => {
  const free = await evaluateAmazonCostPolicy({}, { featureKey:'aws-generic', estimatedIncrementalCostUsd:0 });
  assert.equal(free.allowed,true);
  assert.equal(free.reason,'free-path');
  const paid = await evaluateAmazonCostPolicy({}, { featureKey:'aws-generic', estimatedIncrementalCostUsd:0.01 });
  assert.equal(paid.allowed,false);
  assert.equal(paid.reason,'paid-feature-disabled');
});

test('Amazon sync is blocked until credentials exist', async () => {
  const response = await handleAmazonRequest(new Request('https://ekodi.kr/api/amazon/sync',{method:'POST'}),{});
  assert.equal(response.status,409);
  assert.equal(response.body.error,'AMAZON_SETUP_REQUIRED');
});

test('Amazon cost governance migration is additive and defaults paid services off', async () => {
  const sql = await readFile(new URL('../sites/ekodi-mall/api/migrations/0013_amazon_cost_governance.sql', import.meta.url),'utf8');
  assert.match(sql,/CREATE TABLE IF NOT EXISTS amazon_cost_policy/);
  assert.match(sql,/CREATE TABLE IF NOT EXISTS amazon_usage_snapshots/);
  assert.match(sql,/CREATE TABLE IF NOT EXISTS amazon_cost_approvals/);
  assert.match(sql,/VALUES \('ekodimall',1,0,90,0,0,0,0,0/);
  assert.doesNotMatch(sql,/DROP TABLE|DELETE FROM/i);
});

test('Mall API entry routes Amazon connector and health exposes readiness', async () => {
  const entry = await readFile(new URL('../sites/ekodi-mall/api/entry.js', import.meta.url),'utf8');
  assert.match(entry,/handleAmazonRequest/);
  assert.match(entry,/amazonConnectorStatus/);
  assert.match(entry,/amazonConnector:amazon/);
});

test('Mall admin exposes the canonical Amazon free-first cost center', async () => {
  const admin = await readFile(new URL('../workspace-admin-page.js', import.meta.url),'utf8');
  assert.match(admin,/\['amazon','Amazon'\]/);
  assert.match(admin,/if\(section==='amazon'\)return amazonAdmin\(\)/);
  assert.match(admin,/\/ekodimall\/api\/amazon\/status/);
  assert.match(admin,/\/ekodimall\/api\/amazon\/cost-policy/);
  assert.match(admin,/Amazon · AWS 무료우선 비용센터/);
  assert.match(admin,/무료우선 강제/);
  assert.match(admin,/유료 AWS 허용/);
  assert.match(admin,/FBA 허용/);
  assert.match(admin,/유료기능 승인/);
  assert.match(admin,/api\/amazon\/approvals/);
});
