import test from 'node:test';
import assert from 'node:assert/strict';
import { assessOrderForConfirmation } from './worker.js';

const now = new Date('2026-10-20T12:00:00Z');
const base = { id:'o1', status:'payment_pending', gross_amount:15000, expires_at:'2026-10-20T12:30:00Z' };

test('valid pending order within expiry passes', () => {
  assert.deepEqual(assessOrderForConfirmation(base, 15000, now), { ok:true });
});
test('missing order → 404', () => {
  assert.equal(assessOrderForConfirmation(null, 15000, now).status, 404);
});
test('amount tampering is rejected', () => {
  const r = assessOrderForConfirmation(base, 100, now);
  assert.equal(r.ok, false); assert.equal(r.code, 'AMOUNT_MISMATCH'); assert.equal(r.status, 409);
});
test('NaN amount is rejected', () => {
  assert.equal(assessOrderForConfirmation(base, NaN, now).code, 'AMOUNT_MISMATCH');
});
test('expired order is rejected with 410', () => {
  const r = assessOrderForConfirmation({ ...base, expires_at:'2026-10-20T11:59:59Z' }, 15000, now);
  assert.equal(r.status, 410); assert.equal(r.code, 'ORDER_EXPIRED');
});
test('exact expiry boundary is rejected', () => {
  assert.equal(assessOrderForConfirmation({ ...base, expires_at:now.toISOString() }, 15000, now).code, 'ORDER_EXPIRED');
});
test('missing expiry fails closed', () => {
  assert.equal(assessOrderForConfirmation({ ...base, expires_at:null }, 15000, now).code, 'ORDER_EXPIRY_MISSING');
});
for (const status of ['paid','cancelled','expired','refunded']) {
  test(`non-pending status "${status}" is rejected`, () => {
    assert.equal(assessOrderForConfirmation({ ...base, status }, 15000, now).code, 'ORDER_NOT_PAYABLE');
  });
}
test('zero or negative server amount fails closed', () => {
  assert.equal(assessOrderForConfirmation({ ...base, gross_amount:0 }, 0, now).code, 'ORDER_AMOUNT_INVALID');
});
