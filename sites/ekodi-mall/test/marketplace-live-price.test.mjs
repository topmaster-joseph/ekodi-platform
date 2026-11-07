import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../assets/marketplace-live.js', import.meta.url), 'utf8');

function element(tag) {
  return {
    tag, dataset: {}, children: [], attributes: {}, textContent: '', className: '',
    classList: { add() {} },
    append(...children) { this.children.push(...children); },
    after() {},
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
  };
}

test('public Mall cards never present missing or invalid prices as 0 won', async () => {
  const rows = [
    ['null', null, '가격 확인'],
    ['empty', '', '가격 확인'],
    ['spaces', '   ', '가격 확인'],
    ['zero', 0, '가격 확인'],
    ['zero-string', '0', '가격 확인'],
    ['negative', -50, '가격 확인'],
    ['garbage', '미정', '가격 확인'],
    ['infinite', Infinity, '가격 확인'],
    ['fraction', 12.5, '가격 확인'],
    ['valid', 9900, '9,900원'],
    ['valid-string', '15000', '15,000원'],
  ];
  const grid = element('div');
  const products = rows.map(([id, value]) => ({
    shareCode: id,
    checkoutReady: true,
    publicUrl: '/p/' + id,
    seller: { displayName: '테스트 판매자' },
    product: { category: 'living', name: id, saleType: 'direct', price: value },
  }));
  let notify;
  const notified = new Promise(resolve => { notify = resolve; });
  const document = {
    querySelector: selector => selector === '#grid' ? grid : null,
    querySelectorAll: () => [],
    createElement: element,
  };
  const window = {
    addEventListener() {},
    dispatchEvent(event) {
      if (event.type === 'ekodi:marketplace-products-loaded') notify(event.detail);
    },
  };
  const fetch = async () => ({ ok: true, json: async () => ({ products }) });
  class CustomEvent {
    constructor(type, options) { this.type = type; this.detail = options.detail; }
  }
  runInNewContext(source, {
    document, window, fetch, URLSearchParams, Intl, CustomEvent,
    CSS: { escape: value => value },
  });
  const detail = await Promise.race([
    notified, new Promise((_, reject) => setTimeout(() => reject(new Error('catalog not loaded')), 1500)),
  ]);
  assert.equal(detail.count, rows.length);
  assert.equal(grid.children.length, rows.length);
  for (const [id, , expectedPrice] of rows) {
    const card = grid.children.find(item => item.dataset.serverProduct === id);
    assert.ok(card, 'missing public card: ' + id);
    const body = card.children[1];
    const meta = body.children.at(-1);
    const status = meta.children[0].textContent;
    assert.equal(status, expectedPrice + ' · 판매 중', id);
  }
});
