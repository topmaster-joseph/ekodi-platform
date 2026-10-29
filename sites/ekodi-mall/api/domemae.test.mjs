import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeDomemaeItem } from './domemae.js';

test('Domemae item normalization returns only minimal catalog fields', () => {
  const item = normalizeDomemaeItem({ basis: { no: 12345, title: '테스트 상품', status: '판매중', section: '직접판매', market: 'supply' }, seller: { sellerId: 'vendor' } }, '12345');
  assert.equal(item.itemNo, '12345');
  assert.equal(item.title, '테스트 상품');
  assert.equal(item.status, '판매중');
  assert.equal(item.section, '직접판매');
  assert.equal(item.market, 'supply');
});

test('Domemae migration keeps order and PII execution locked in DB', async () => {
  const sql = await readFile(new URL('./migrations/0012_domemae_official_connector.sql', import.meta.url), 'utf8');
  assert.match(sql, /'domemae-official'/);
  assert.match(sql, /'supplier_api'/);
  assert.match(sql, /'api_order'/);
  assert.match(sql, /DOMEMAE_EXECUTION_LOCKED/);
  assert.match(sql, /auto_order_enabled,customer_pii_allowed/);
  assert.match(sql, /supplier_connector_checks/);
});

test('connector source implements lookup and dry-run but not setOrder execution', async () => {
  const source = await readFile(new URL('./domemae.js', import.meta.url), 'utf8');
  assert.match(source, /mode: 'getItemView'/);
  assert.match(source, /order-dry-run/);
  assert.match(source, /executionAllowed: false/);
  assert.doesNotMatch(source, /mode:\s*'setOrder'/);
  assert.doesNotMatch(source, /DOMEMAE_ORDER_ENABLED/);
  assert.doesNotMatch(source, /recipientName|shippingAddress|buyerPhone/i);
});

test('credentials are referenced only as environment secrets and never returned', async () => {
  const source = await readFile(new URL('./domemae.js', import.meta.url), 'utf8');
  assert.match(source, /env\.DOMEMAE_API_KEY/);
  assert.match(source, /env\.DOMEMAE_USER_ID/);
  assert.match(source, /env\.DOMEMAE_SESSION_ID/);
  assert.match(source, /apiKeyConfigured/);
  assert.doesNotMatch(source, /apiKey:\s*env\.DOMEMAE_API_KEY/);
});


test('readiness exposes only safe allowlisted authentication diagnostic fields', async () => {
  const { handleDomemaeRequest } = await import('./domemae.js');
  const env = {
    MALL_OPERATIONS_TOKEN: 'SECRET_MALL_OPS', DOMEMAE_API_KEY: 'SECRET_API', DOMEMAE_USER_ID: 'user123',
    DOMEMAE_PASSWORD: 'SECRET_PASSWORD', DOMEGGOOK_READONLY_AUTH_PROBE_ENABLED: 'true', DOMEMAE_LOOKUP_ENABLED: 'false',
    DB: {
      prepare(sql) {
        let args = [];
        return {
          bind(...values) { args = values; return this; },
          async first() {
            if (sql.includes('FROM sourcing_providers')) return { provider_type: 'supplier_api', integration_mode: 'api', catalog_policy: 'reference_only', order_mode: 'api_order', auto_order_enabled: 0, customer_pii_allowed: 0 };
            if (sql.includes('FROM supplier_connector_checks')) return { result_status: 'failed', checked_at: '2026-10-29T03:00:00Z',
              metadata_json: JSON.stringify({ login: 'ok', asset: 'failed', errorCode: 'MEMBER_ERROR', rawResponse: 'SECRET_PASSWORD', extra: 'SECRET_API' }) };
            return null;
          },
          async run() { return {}; }
        };
      }
    }
  };
  const req = new Request('https://mall-api.ekodi.kr/api/internal/connectors/domemae/readiness', { headers: { 'x-ekodi-mall-ops-token': 'SECRET_MALL_OPS' } });
  const result = await handleDomemaeRequest(req, env);
  assert.equal(result.status, 200);
  assert.equal(result.body.readiness.readOnlyAuthProbe.errorCode, 'MEMBER_ERROR');
  assert.equal(result.body.readiness.readOnlyAuthProbe.result, 'failed');
  assert.equal(result.body.readiness.gates.autoOrderEnabled, false);
  const responseText = JSON.stringify(result.body);
  for (const secret of ['SECRET_API','SECRET_PASSWORD','SECRET_MALL_OPS']) assert.ok(!responseText.includes(secret));
  assert.ok(!responseText.includes('rawResponse'));
});
