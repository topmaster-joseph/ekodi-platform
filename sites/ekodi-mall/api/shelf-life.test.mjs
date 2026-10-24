import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanExpiryDate, kstToday, shelfLifeCutoff, isInExpiryWindow, sweepExpiryWindow, EXPIRY_BLOCKER } from './shelf-life.js';
import { normalizeProductInput } from './worker.js';

const NOW = new Date('2026-10-24T15:30:00Z'); // 2026-10-25 00:30 KST

test('KST 날짜와 3개월 기준일', () => {
  assert.equal(kstToday(NOW), '2026-10-25');
  assert.equal(shelfLifeCutoff(NOW), '2027-01-25');
  assert.equal(shelfLifeCutoff(new Date('2026-11-29T16:00:00Z')), '2027-02-28'); // 11-30 KST → 말일 보정
  assert.equal(shelfLifeCutoff(new Date('2027-11-29T16:00:00Z')), '2028-02-29'); // 윤년
});

test('소비기한 형식 정리', () => {
  assert.equal(cleanExpiryDate('2027.03.01'), '2027-03-01');
  assert.equal(cleanExpiryDate('2027/03/01'), '2027-03-01');
  assert.equal(cleanExpiryDate('2027-02-30'), null);
  assert.equal(cleanExpiryDate('내년'), null);
  assert.equal(cleanExpiryDate(''), null);
});

test('3개월 미만은 판매 불가 구간, 미입력은 판단하지 않음', () => {
  assert.equal(isInExpiryWindow('2026-08-21', NOW), true);  // 이미 지난 실제 사례
  assert.equal(isInExpiryWindow('2027-01-24', NOW), true);  // 3개월에서 하루 모자람
  assert.equal(isInExpiryWindow('2027-01-25', NOW), false); // 정확히 3개월
  assert.equal(isInExpiryWindow(null, NOW), false);
  assert.equal(EXPIRY_BLOCKER, 'expiry-window');
});

test('직접판매 입력 정규화: 잘못된 날짜는 오류, 제휴판매는 무시', () => {
  const base = { seller: { displayName: '에코디' }, product: { name: '비타민', saleType: 'direct', contact: 'x@ekodi.kr', stockQuantity: 1 } };
  const bad = normalizeProductInput({ ...base, product: { ...base.product, expiryDate: '2027-13-01' } });
  assert.ok(bad.errors.some(e => e.includes('소비기한')));
  const ok = normalizeProductInput({ ...base, product: { ...base.product, expiryDate: '2027-06-30' } });
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.value.product.expiryDate, '2027-06-30');
  const aff = normalizeProductInput({ ...base, product: { ...base.product, saleType: 'affiliate', affiliateUrl: 'https://example.com', expiryDate: '2027-06-30' } });
  assert.equal(aff.value.product.expiryDate, null);
});

test('cron 스윕: 스키마 준비 전에는 건너뛰고, 준비되면 기준일로 품절 처리', async () => {
  const calls = [];
  const make = (hasColumn) => ({ DB: { prepare(sql) {
    return { all: async () => ({ results: hasColumn ? [{ name: 'expiry_date' }] : [] }),
      bind: (...args) => ({ run: async () => { calls.push({ sql, args }); return { meta: { changes: 2 } }; } }) };
  } } });
  assert.deepEqual(await sweepExpiryWindow(make(false), NOW), { skipped: 'schema-not-ready', soldOut: 0 });
  const r = await sweepExpiryWindow(make(true), NOW);
  assert.equal(r.soldOut, 2);
  assert.equal(r.cutoff, '2027-01-25');
  assert.match(calls[0].sql, /stock_quantity=0/);
  assert.match(calls[0].sql, /expiry_sold_out_at IS NULL/);
  assert.equal(calls[0].args[2], '2027-01-25');
});
