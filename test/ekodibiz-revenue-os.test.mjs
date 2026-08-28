import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const worker = fs.readFileSync(new URL('../ekodibiz-worker.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../ekodibiz/index.html', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../ekodibiz/app.js', import.meta.url), 'utf8');
const config = fs.readFileSync(new URL('../wrangler.ekodibiz.toml', import.meta.url), 'utf8');
const staging = fs.readFileSync(new URL('../wrangler.ekodibiz-staging.toml', import.meta.url), 'utf8');

test('EKODIBIZ stays separate from common Business OS', () => {
  assert.match(config, /pattern = "biz\.ekodi\.kr"/);
  assert.doesNotMatch(config, /pattern = "business\.ekodi\.kr"/);
  assert.match(config, /main = "ekodibiz-worker\.js"/);
});

test('conversation-first UI exposes the revenue loop', () => {
  assert.match(html, /무엇을 이루고 싶으세요/);
  assert.match(html, /가치를 발견하고, 사업으로 만들고, 수익이 흐르게 합니다/);
  for (const label of ['발견','상품화','홍보','상담·판매','결제','실행','성장']) assert.match(html, new RegExp(label));
  assert.match(app, /\/api\/consult/);
  assert.match(app, /\/api\/offers/);
  assert.match(app, /\/api\/checkout-intent/);
  assert.match(app, /\/api\/ops\/status/);
});

test('high impact actions are approval-gated and prices are not invented', () => {
  for (const action of ['payment','ad_spend','refund','contract','price_change','external_publish']) assert.match(worker, new RegExp(`'${action}'`));
  assert.match(worker, /approval_required/);
  assert.match(worker, /quote_required/);
  assert.match(worker, /amount: null/);
  assert.match(worker, /https:\/\/pay\.ekodi\.kr/);
});

test('worker exposes operational APIs and persistent AI staff queue', () => {
  for (const endpoint of ['/api/health','/api/runtime','/api/catalog','/api/consult','/api/offers','/api/execution-preview','/api/checkout-intent','/api/ops/status']) assert.match(worker, new RegExp(endpoint.replaceAll('/','\\/')));
  assert.match(worker, /export class RevenueStore extends DurableObject/);
  for (const role of ['growth_scout','offer_builder','ops_coordinator','finance_gatekeeper']) assert.match(worker, new RegExp(role));
  assert.match(worker, /processSafeTasks/);
  assert.match(worker, /personalDataMode: 'anonymous-goal-only'/);
});

test('production and staging use SQLite Durable Object persistence', () => {
  for (const source of [config, staging]) {
    assert.match(source, /name = "REVENUE_STORE"/);
    assert.match(source, /class_name = "RevenueStore"/);
    assert.match(source, /\[exports\.RevenueStore\]/);
    assert.match(source, /storage = "sqlite"/);
  }
  assert.match(config, /crons = \["\*\/15 \* \* \* \*"\]/);
});

test('anonymous intake is disclosed and UI forwards lead identity without contact data', () => {
  assert.match(html, /이 단계에서는 이름·전화번호·이메일을 수집하지 않습니다/);
  assert.match(app, /leadId:state\.leadId/);
  assert.match(worker, /containsContactData: false/);
});
