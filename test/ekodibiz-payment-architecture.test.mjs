import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import gatewayWorker from '../ekodibiz-pay-gateway-worker.js';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('EKODIBIZ keeps shared payment core separate from canonical gateway', async () => {
  const [adapter, prod, staging, gatewayConfig, gateway] = await Promise.all([
    read('ekodibiz-payment-architecture.js'),
    read('wrangler.ekodibiz.toml'),
    read('wrangler.ekodibiz-staging.toml'),
    read('wrangler.ekodibiz-pay-gateway.toml'),
    read('ekodibiz-pay-gateway-worker.js')
  ]);
  const all = [adapter, prod, staging, gatewayConfig, gateway].join('\n');
  assert.match(adapter, /https:\/\/pay\.ekodi\.kr/);
  assert.match(adapter, /https:\/\/ekodi\.kr\/ekodibiz\/pay/);
  assert.match(prod, /PAYMENT_CORE_URL = "https:\/\/pay\.ekodi\.kr"/);
  assert.match(prod, /PAYMENT_GATEWAY_URL = "https:\/\/ekodi\.kr\/ekodibiz\/pay"/);
  assert.match(staging, /PAYMENT_CORE_URL = "https:\/\/pay\.ekodi\.kr"/);
  assert.match(gatewayConfig, /pattern = "ekodi\.kr\/ekodibiz\/pay\*"/);
  assert.doesNotMatch(all, /pay\.biz\.ekodi\.kr/);
});

test('gateway fails closed until an approved quote exists', async () => {
  const response = await gatewayWorker.fetch(new Request('https://ekodi.kr/ekodibiz/pay'));
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /견적 승인 후 결제가 가능합니다/);
  assert.match(html, /pay\.ekodi\.kr/);
});

test('gateway rejects client supplied amount and price', async () => {
  for (const url of [
    'https://ekodi.kr/ekodibiz/pay?amount=100',
    'https://ekodi.kr/ekodibiz/pay?price=100',
    'https://ekodi.kr/ekodibiz/pay?total=100'
  ]) {
    const response = await gatewayWorker.fetch(new Request(url));
    assert.equal(response.status, 400);
    assert.match(await response.text(), /금액 입력이 차단되었습니다/);
  }
});

test('gateway rejects invalid order ids without contacting payment core', async () => {
  const response = await gatewayWorker.fetch(new Request('https://ekodi.kr/ekodibiz/pay?orderId=BAD-123'));
  assert.equal(response.status, 400);
  assert.match(await response.text(), /주문 정보를 확인할 수 없습니다/);
});
