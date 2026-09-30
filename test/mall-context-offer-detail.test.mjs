import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const js = await readFile(new URL('../sites/ekodi-mall/assets/context-curator.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../sites/ekodi-mall/assets/context-curator.css', import.meta.url), 'utf8');
const verify = await readFile(new URL('../sites/ekodi-mall/scripts/verify-build.mjs', import.meta.url), 'utf8');

test('context shopping opens product detail before outbound provider purchase', () => {
  assert.match(js, /context-detail-button/);
  assert.match(js, /function openProductDetail/);
  assert.match(js, /어디서 살까요\?/);
  assert.match(js, /판매처에서 구매/);
  assert.match(js, /sponsored noopener/);
  assert.match(js, /context-product-open/);
  assert.doesNotMatch(js, /action\.append\([^\n]+offerLink\(product\.offers\[0\]\)/);
});
test('offer detail preserves seller-neutral comparison and freshness cues', () => {
  assert.match(js, /imageUrl: safeUrl\(raw\?\.imageUrl\)/);
  assert.match(js, /priceFreshness: clean/);
  assert.match(js, /현재 표시가 최저/);
  assert.match(js, /빠른배송/);
  assert.match(js, /무료배송/);
  assert.match(js, /판매처 최신가 확인/);
  assert.match(js, /추천순위와 제휴수수료는 분리합니다/);
});

test('Mall build contract ships the offer detail experience and responsive dialog', () => {
  assert.match(css, /context-offer-dialog/);
  assert.match(css, /context-detail-offer/);
  assert.match(css, /@media\(max-width:640px\)/);
  assert.match(verify, /context-detail-button/);
  assert.match(verify, /어디서 살까요\?/);
});
