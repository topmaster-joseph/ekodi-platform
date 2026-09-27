import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { amazonConnectorStatus, handleAmazonRequest } from '../sites/ekodi-mall/api/amazon.js';

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
  assert.ok(status.sellerCentral.resources.includes('orders'));
  assert.ok(status.sellerCentral.resources.includes('fulfillment'));
});

test('Amazon sync is blocked until credentials exist', async () => {
  const response = await handleAmazonRequest(new Request('https://ekodi.kr/api/amazon/sync',{method:'POST'}),{});
  assert.equal(response.status,409);
  assert.equal(response.body.error,'AMAZON_SETUP_REQUIRED');
});

test('Mall API entry routes Amazon connector and health exposes readiness', async () => {
  const entry = await readFile(new URL('../sites/ekodi-mall/api/entry.js', import.meta.url),'utf8');
  assert.match(entry,/handleAmazonRequest/);
  assert.match(entry,/amazonConnectorStatus/);
  assert.match(entry,/amazonConnector:amazon/);
});

test('Mall admin exposes the canonical Amazon center', async () => {
  const admin = await readFile(new URL('../workspace-admin-page.js', import.meta.url),'utf8');
  assert.match(admin,/\['amazon','Amazon'\]/);
  assert.match(admin,/if\(section==='amazon'\)return amazonAdmin\(\)/);
  assert.match(admin,/\/api\/amazon\/status/);
  assert.match(admin,/Amazon 연결센터/);
});
