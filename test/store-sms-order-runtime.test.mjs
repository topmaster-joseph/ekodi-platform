import test from 'node:test';
import assert from 'node:assert/strict';
import { classifySmsOrderInput, customerSmsOrderReply, isOpaqueSmsThreadId, customerCanCancelSmsOrder } from '../store-sms-order-runtime.js';

test('SMS order input classifier recognizes explicit confirmation and cancellation',()=>{
  for(const value of ['1','확정','주문확정','네','YES'])assert.equal(classifySmsOrderInput(value),'confirm');
  for(const value of ['2','취소','주문취소','아니요','NO'])assert.equal(classifySmsOrderInput(value),'cancel');
});

test('free text remains an order draft instead of being silently executed',()=>{
  assert.equal(classifySmsOrderInput('후라이드 1마리 콜라 큰 것 1개'),'order_text');
  assert.equal(classifySmsOrderInput('   '),'empty');
});

test('customer draft reply requires a second explicit confirmation',()=>{
  const reply=customerSmsOrderReply('draft',{orderText:'후라이드 1마리'});
  assert.match(reply,/주문이 맞으면 1/);
  assert.match(reply,/취소는 2/);
  assert.match(reply,/후라이드 1마리/);
});

test('accepted reply does not invent price, payment, or delivery promises',()=>{
  const reply=customerSmsOrderReply('accepted',{orderText:'피자 1판'});
  assert.match(reply,/매장에서 주문을 접수/);
  assert.match(reply,/최종 금액/);
  assert.doesNotMatch(reply,/\d+,?\d*원/);
});


test('SMS ingress requires opaque bridge thread IDs instead of raw phone or email identifiers',()=>{
  assert.equal(isOpaqueSmsThreadId('conv_8d5a530d-8206-44bd-9e2e-883266e5a777'),true);
  assert.equal(isOpaqueSmsThreadId('010-1234-5678'),false);
  assert.equal(isOpaqueSmsThreadId('customer@example.com'),false);
});


test('customer self-cancel stops once the store has accepted the order',()=>{
  assert.equal(customerCanCancelSmsOrder('awaiting_customer_confirmation'),true);
  assert.equal(customerCanCancelSmsOrder('customer_confirmed'),true);
  assert.equal(customerCanCancelSmsOrder('store_accepted'),false);
  assert.equal(customerCanCancelSmsOrder('completed'),false);
  assert.match(customerSmsOrderReply('no_draft'),/먼저 주문 내용을/);
});
