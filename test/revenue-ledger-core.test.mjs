import test from 'node:test';
import assert from 'node:assert/strict';
import {
  allocateRealizedRevenue,
  currencyCode,
  exposureOnlySignal,
  minorAmount,
  normalizeRealizedRevenue,
} from '../revenue-ledger-core.js';

test('exposure by itself is never counted as realized revenue', () => {
  assert.deepEqual(exposureOnlySignal({ impressions: 1200, clicks: 31 }), {
    impressions: 1200,
    clicks: 31,
    realizedRevenue: 0,
    status: 'non_monetary_signal',
  });
});

test('confirmed provider event normalizes gross fee and net in minor units', () => {
  assert.deepEqual(normalizeRealizedRevenue({
    provider: 'ExampleAds',
    externalRef: 'settlement-2026-09-12',
    source: 'ads',
    amount: 12500,
    fee: 500,
    currency: 'krw',
    tenantKey: 'tenant-a',
    siteKey: 'site-a',
    confirmed: true,
  }), {
    eventKey: 'exampleads:settlement-2026-09-12',
    provider: 'exampleads',
    externalRef: 'settlement-2026-09-12',
    source: 'ads',
    tenantKey: 'tenant-a',
    siteKey: 'site-a',
    currency: 'KRW',
    gross: 12500,
    fee: 500,
    net: 12000,
    status: 'confirmed',
  });
});

test('provider event is pending until confirmation is explicit', () => {
  assert.equal(normalizeRealizedRevenue({
    provider: 'affiliate-network',
    externalRef: 'conversion-1',
    source: 'affiliate',
    amount: 3000,
  }).status, 'pending');
});

test('allocation totals exactly match realized net even with rounding', () => {
  const rows = allocateRealizedRevenue(101, [
    { recipient: 'operator:tenant-a', bps: 7000 },
    { recipient: 'platform:ekodi', bps: 3000 },
  ]);
  assert.equal(rows.reduce((sum, row) => sum + row.amount, 0), 101);
  assert.deepEqual(rows.map(row => row.amount), [71, 30]);
});

test('invalid monetary values and allocations fail closed', () => {
  assert.throws(() => minorAmount(-1), /non-negative/);
  assert.throws(() => currencyCode('kr'), /ISO/);
  assert.throws(() => normalizeRealizedRevenue({ provider: 'x', externalRef: '1', amount: 100, fee: 101 }), /fee/);
  assert.throws(() => allocateRealizedRevenue(100, [{ recipient: 'a', bps: 9999 }]), /10000/);
});
