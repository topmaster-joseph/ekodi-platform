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
