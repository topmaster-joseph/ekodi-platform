import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const script = readFileSync(new URL('../assets/bookstore-live.js', import.meta.url), 'utf8');
const bookId = 'BOOK-EKODI-000002';
const product = {
  id: 'bookstore-' + bookId, bookId, slug: 'book-eb-mono-002',
  name: 'AI 시대의 진보와 빈곤', description: '인공지능의 풍요를 모두의 몫으로',
  price: 9900, saleReady: false
};

function createHarness() {
  let scenario = 'ready';
  let visibility;
  let delayedReply;
  let signal;
  const loaded = [];
  const make = (tag, cls = '') => {
    const el = {
      tag, className: cls, dataset: {}, textContent: '',
      children: [], hidden: false, _parent: null,
      classList: { add() {}, remove() {} },
      append(...nodes) {
        for (const node of nodes) { node._parent = this; this.children.push(node); }
      },
      remove() {
        if (this._parent) this._parent.children = this._parent.children.filter(n => n !== this);
      },
      setAttribute() {},
      querySelector(selector) {
        if (selector === '.meta .status') {
          const all = [];
          const visit = x => { all.push(x); for(const child of x.children)visit(child); };
          visit(this);
          return all.find(x => x.className === 'status') || null;
        }
        return null;
      },
    };
    return el;
  };
  const grid = make('div');
  grid.querySelector = selector => {
    const matched = selector.match(/^\[data-product="([^"]+)"\]$/);
    return matched ? grid.children.find(x => x.dataset.product === matched[1]) || null : null;
  };
  grid.querySelectorAll = selector => {
    if (selector === '[data-bookstore-runtime-id]') return grid.children.filter(x => !!x.dataset.bookstoreRuntimeId);
    if (selector === '[data-bookstore-quote-pending="false"]') return grid.children.filter(x => x.dataset.bookstoreQuotePending === 'false');
    if (selector === '.card:not([data-bookstore-quote-pending="true"])') return grid.children.filter(x => x.dataset.bookstoreQuotePending !== 'true');
    return [];
  };
  const count = make('span');
  const status = make('span');
  const document = {
    body: { dataset: {} },
    hidden: false,
    getElementById: name => name === 'grid' ? grid : null,
    querySelector: selector => selector === '[data-bookstore-store-grid]' ? null
      : selector === '[data-bookstore-public-count]' ? count
      : selector === '[data-bookstore-store-status]' ? status : null,
    querySelectorAll: () => [],
    createElement: tag => make(tag),
    addEventListener(name, callback) { if (name === 'visibilitychange') visibility = callback; },
  };
  const quote = ready => ({
    book: { id: bookId },
    saleReadiness: { ready },
    checkout: { open: ready, fileReady: ready, saleReady: ready, mode: 'live' },
    price: { amount: 9900 },
  });
  const fetch = async url => {
    if (url.endsWith('/provider-bookstore.json')) {
      if (scenario === 'mirror-error') throw new Error('mirror timeout');
      return { ok: true, json: async () => ({ products: [product] }) };
    }
    if (url.endsWith('/public/approvals')) {
      if (scenario === 'approval-error') throw new Error('approvals timeout');
      return { ok: true, json: async () => ({ approvals: scenario === 'removed' ? [] : [{ bookId }] }) };
    }
    if (url.includes('/quote?book=')) {
      if (scenario === 'quote-error') throw new Error('quote timeout');
      if (scenario === 'hold-ready') {
        return new Promise(resolve => { delayedReply = () => resolve({ ok: true, json: async () => quote(true) }); });
      }
      return { ok: true, json: async () => quote(scenario !== 'revoked') };
    }
    throw new Error('unexpected URL ' + url);
  };
  const window = {
    location: { origin: 'https://ekodi.kr' },
    dispatchEvent(event) {
      if(event.type === 'ekodi:marketplace-products-loaded'){
        loaded.push(event.detail);
        signal?.();
      }
    },
  };
  class CustomEvent { constructor(type, options) { this.type = type; this.detail = options.detail; } }
  vm.runInNewContext(script, { document, window, fetch, AbortSignal, URL, Intl, CustomEvent });
  async function settle() {
    const before = loaded.length;
    await new Promise((resolve, reject) => {
      if (loaded.length > before) return resolve();
      signal = resolve;
      const timeout = setTimeout(() => { signal = null; reject(new Error('bookstore sync timed out')); }, 2000);
      signal = () => { clearTimeout(timeout); signal = null; resolve(); };
    });
  }
  async function refresh(mode) {
    scenario = mode;
    visibility();
    await settle();
  }
  return { grid, count, status, loaded, refresh, settle,
    holdReady: () => { scenario = 'hold-ready'; visibility(); },
    releaseHeld: () => delayedReply?.(),
    card: () => grid.children.find(x => x.dataset.bookstoreRuntimeId === bookId)
  };
}

test('a live-verified book survives temporary quote and approvals outages as information only', async () => {
  const h = createHarness();
  await h.settle();
  const card = h.card();
  assert.ok(card, 'live-approved book appears');
  assert.equal(card.dataset.bookstoreQuotePending, 'false');
  assert.equal(card.dataset.saleReady, 'true');
  assert.match(card.querySelector('.meta .status').textContent, /9,900원 · 판매 중/);
  await h.refresh('quote-error');
  assert.equal(h.card(), card, 'same DOM card is retained, not deleted/recreated');
  assert.equal(card.dataset.bookstoreQuotePending, 'true');
  assert.equal(card.dataset.bookstoreInformational, 'true');
  assert.equal(card.dataset.saleReady, 'false');
  assert.equal(card.querySelector('.meta .status').textContent, '판매 상태 확인 중 · 자세히 보기');
  assert.equal(h.count.textContent, '0개', 'information-only book is not a sale');
  await h.refresh('approval-error');
  assert.equal(h.card(), card);
  assert.equal(card.dataset.bookstoreInformational, 'true');
  await h.refresh('mirror-error');
  assert.equal(h.card(), card);
  await h.refresh('ready');
  assert.equal(h.card(), card, 'subsequent successful revalidation reuses existing DOM');
  assert.equal(card.dataset.bookstoreQuotePending, 'false');
  assert.equal(card.dataset.bookstoreInformational, 'false');
  assert.equal(card.dataset.saleReady, 'true');
  assert.equal(h.count.textContent, '1개');
});

test('authoritative revocation or removal never keeps an old sale card visible', async () => {
  const h = createHarness();
  await h.settle();
  assert.ok(h.card());
  await h.refresh('revoked');
  assert.equal(h.card(), undefined, 'negative quote removes the runtime sale');
  await h.refresh('ready');
  assert.ok(h.card(), 'new positive quote recovers the approved item');
  await h.refresh('removed');
  assert.equal(h.card(), undefined, 'complete approval-list removal withdraws the card');
});

test('an older delayed quote cannot reinstate a card after a newer revoked response', async () => {
  const h = createHarness();
  await h.settle();
  h.holdReady();
  await new Promise(resolve => setImmediate(resolve));
  await h.refresh('revoked');
  assert.equal(h.card(), undefined);
  h.releaseHeld();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.card(), undefined, 'stale positive quote must not resurrect a withdrawn card');
});

test('informational fallback remains out of central sale search, but can stay in books catalog', () => {
  const app = readFileSync(new URL('../assets/app.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../assets/home-refresh.css', import.meta.url), 'utf8');
  const search = readFileSync(new URL('../assets/home-refresh.js', import.meta.url), 'utf8');
  assert.match(app, /card\.dataset\.bookstoreInformational === 'true'/);
  assert.match(css, /\.card\[data-bookstore-quote-pending="true"\]:not\(\[data-bookstore-informational="true"\]\)/);
  assert.match(search, /\.filter\(card => card\.dataset\.bookstoreQuotePending !== 'true'\)/);
});
