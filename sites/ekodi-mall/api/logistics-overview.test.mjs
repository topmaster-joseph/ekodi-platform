import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildSellerLogisticsOverview } from './logistics-overview.js';

test('seller-scoped overview counts attention and active shipments without buyer PII', () => {
  const result = buildSellerLogisticsOverview([
    { status: 'awaiting_pii', supplierPayableAmount: 1000, recipientName: '비공개', shippingAddress: '비공개' },
    { status: 'shipped', supplierPayableAmount: 2500 },
    { status: 'delivered', supplierPayableAmount: 1500 },
    { status: 'return_requested', supplierPayableAmount: 2000 },
    { status: 'failed', supplierPayableAmount: 500 }
  ], { buyerPiiReleaseEnabled: false, supplierForwardEnabled: false });
  assert.equal(result.scope, 'authenticated-seller');
  assert.equal(result.sampledOrderCount, 5);
  assert.equal(result.counts.awaitingPii, 1);
  assert.equal(result.counts.active, 1);
  assert.equal(result.counts.shipped, 1);
  assert.equal(result.counts.delivered, 1);
  assert.equal(result.counts.returns, 1);
  assert.equal(result.counts.attention, 3);
  assert.equal(result.supplierPayablePlannedAmount, 7500);
  assert.equal(result.execution.dashboardReadOnly, true);
  assert.equal(result.execution.payoutExecutionEnabled, false);
  assert.doesNotMatch(JSON.stringify(result), /비공개|recipient|shippingAddress/);
});

test('overview refuses malformed amounts, treats gate strings as OFF, flags 100-record cap', () => {
  const rows = Array.from({ length: 100 }, () => ({ status: 'ready_to_forward', supplierPayableAmount: 'Infinity' }));
  rows[0].supplierPayableAmount = 4000;
  rows[1].supplierPayableAmount = -5000;
  const summary = buildSellerLogisticsOverview(rows, { buyerPiiReleaseEnabled: 'true', supplierForwardEnabled: true });
  assert.equal(summary.supplierPayablePlannedAmount, 4000);
  assert.equal(summary.counts.readyToForward, 100);
  assert.equal(summary.latest100Only, true);
  assert.equal(summary.execution.buyerPiiReleaseEnabled, false);
  assert.equal(summary.execution.supplierForwardEnabled, true);
});

test('existing seller-authenticated API owns the logistics projection and does not create a public aggregate', async () => {
  const source = await readFile(new URL('./fulfillment.js', import.meta.url), 'utf8');
  assert.match(source, /buildSellerLogisticsOverview\(fulfillments, gates\)/);
  assert.match(source, /const user = await authenticate\(request,env\)/);
  assert.match(source, /listSellerFulfillments\(env,user\.id\)/);
  assert.doesNotMatch(source, /\/api\/public\/logistics/);
});

test('review queue prioritizes blockers, returns only allowlisted fields, and never leaks buyer data', () => {
  const sample = [
    { id:'ful_aabbcc', orderId:'ord_8', status:'awaiting_pii', recipientName:'개인정보', address:'민감정보', supplierPayableAmount: 1000 },
    { id:'ful_ff0011', orderId:'ord_9', status:'failed', recipientName:'개인정보', trackingNumber:'SECRET_TRACK' },
    { id:'ful_5', orderId:'buyer@email.com', status:'return_requested', buyer:{ phone: '비밀' } },
    { id:'ful_6', orderId:'ord_10', status:'shipped' }
  ];
  const result = buildSellerLogisticsOverview(sample, {});
  assert.equal(result.counts.attention, 3);
  assert.deepEqual(result.attentionQueue.map(item => item.status), ['failed','return_requested','awaiting_pii']);
  assert.equal(result.attentionQueue[1].orderId, '');
  assert.deepEqual(Object.keys(result.attentionQueue[0]), ['fulfillmentId','orderId','status','priority','label','nextAction']);
  assert.doesNotMatch(JSON.stringify(result), /개인정보|민감정보|SECRET_TRACK|비밀|buyer@email.com|trackingNumber/);
  assert.equal(result.attentionQueueTruncated, false);
});

test('review queue respects 20 item bound and keeps safety gates independent', () => {
  const rows = Array.from({length: 31}, (_, i) => ({
    id: 'ful_' + String(i + 1).padStart(32, '0'),
    orderId: 'ord_' + i,
    status: i % 2 ? 'failed' : 'ready_to_forward'
  }));
  const result = buildSellerLogisticsOverview(rows, {});
  assert.equal(result.counts.attention, 31);
  assert.equal(result.attentionQueue.length, 20);
  assert.equal(result.attentionQueueTruncated, true);
  assert.equal(result.attentionQueue[0].status, 'failed');
  assert.equal(result.execution.dashboardReadOnly, true);
  assert.equal(result.execution.refundExecutionEnabled, false);
});
