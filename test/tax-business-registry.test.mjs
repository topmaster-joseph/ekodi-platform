import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ntsStatusUrl, normalizeNtsStatus } from '../tax-business-registry-service.js';

const financeEntry = fs.readFileSync(new URL('../finance-entry-worker.js', import.meta.url), 'utf8');
const router = fs.readFileSync(new URL('../platform-router-entry-worker.js', import.meta.url), 'utf8');
const ui = fs.readFileSync(new URL('../tax-business-registry.js', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../migrations/0045_finance_tax_business_registry.sql', import.meta.url), 'utf8');

test('NTS status endpoint keeps service key server-side', () => {
  const url = new URL(ntsStatusUrl('sample key/+'));
  assert.equal(url.origin, 'https://api.odcloud.kr');
  assert.equal(url.pathname, '/api/nts-businessman/v1/status');
  assert.equal(url.searchParams.get('serviceKey'), 'sample key/+');
});

test('NTS status response is normalized for EKODI Tax', () => {
  const item = normalizeNtsStatus({
    b_no: '123-45-67890',
    b_stt: '계속사업자',
    b_stt_cd: '01',
    tax_type: '부가가치세 일반과세자',
    tax_type_cd: '01',
    end_dt: ''
  });
  assert.equal(item.corpNum, '1234567890');
  assert.equal(item.active, true);
  assert.equal(item.businessStatus, '계속사업자');
  assert.match(item.taxType, /일반과세자/);
});

test('Finance namespace and router include NTS registry cache', () => {
  assert.match(financeEntry, /tax_business_registry_status: 'finance_tax_business_registry_status'/);
  assert.match(financeEntry, /taxBusinessRegistryService\.fetch/);
  assert.match(financeEntry, /\/api\/finance\/tax-business-/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS finance_tax_business_registry_status/);
  assert.match(migration, /PRIMARY KEY \(organization_id, corp_num\)/);
});

test('Tax portal injects batch refresh and inline business number verification', () => {
  assert.match(router, /injectTaxBusinessRegistry/);
  assert.match(ui, /ntsBusinessRefresh/);
  assert.match(ui, /\/api\/finance\/tax-business-status/);
  assert.match(ui, /국세청 상태 확인/);
  assert.match(ui, /30\*60\*1000/);
  assert.match(ui, /x-ekodi-tax-business-registry/);
});
