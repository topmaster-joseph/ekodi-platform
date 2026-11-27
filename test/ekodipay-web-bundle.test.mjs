// Reproduce the real Wrangler bundle boundary. Serializing a bundled closure
// previously emitted a free __name helper and broke every account screen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { webPayClientSource } from '../ekodipay-web-page.js';

async function bootInFixture(source, mode, mall = false) {
  class Element {
    constructor() { this.children = []; this.listeners = {}; this.disabled = true; this.value = ''; this.textContent = ''; }
    addEventListener(type, handler) { this.listeners[type] = handler; }
    append(...children) { this.children.push(...children); }
    replaceChildren() { this.children = []; }
    setAttribute() {}
    removeAttribute() {}
  }
  const pageIds = {
    wallet: ['cards', 'addCard', 'manageCards'],
    send: ['requestForm', 'service', 'orderId', 'requestLink', 'requestResult', 'expiry', 'copyLink', 'cancelLink'],
    request: ['requestMerchant', 'requestAmount', 'requestExpiry', 'acceptRequest', 'payerConsent'],
    seller: ['sellerForm', 'workspaceId', 'start', 'end', 'reportRows', 'gross', 'net', 'paid', 'terms', 'source', 'export', 'more'],
  };
  const nodes = Object.fromEntries(['login', 'notice', 'connection', ...pageIds[mode]].map(id => ['#' + id, new Element()]));
  const readyButtons = mode === 'wallet' ? [nodes['#addCard'], nodes['#manageCards']] : [];
  const calls = [];
  const context = {
    URL, URLSearchParams, Date, Intl, Number, JSON, Promise, setTimeout, clearTimeout,
    location: { origin: 'https://ekodi.kr', pathname: '/ekodipay/' + mode,
      href: 'https://ekodi.kr/ekodipay/' + mode, hash: mode === 'request' ? '#' + 'a'.repeat(64) : '' },
    history: { replaceState() {} }, navigator: {}, window: {},
    localStorage: { getItem: () => JSON.stringify({ access_token: 'fixture-only', expires_at: Math.floor(Date.now() / 1000) + 3600 }) },
    sessionStorage: { getItem: () => null, removeItem() {}, setItem() {} },
    document: {
      body: { dataset: { payView: mode }, setAttribute() {}, removeAttribute() {} },
      head: new Element(), createElement: () => new Element(),
      querySelector: selector => nodes[selector] || null,
      querySelectorAll: selector => selector === 'button[data-requires-connection]' ? readyButtons : [],
    },
    async fetch(path) {
      calls.push(path);
      let result;
      if (path.endsWith('/status')) result = { enabled: !mall, cardRegistration: !mall, delegatedPayment: !mall, sellerReports: true, mallSellerReports: mall };
      else if (path.endsWith('/wallet')) result = { cards: [{ label: '테스트카드', last4: '1234', type: '신용' }] };
      else if (path.endsWith('/seller/workspaces')) result = { workspaces: [{ id: 'workspace-1', name: '테스트매장' }] };
      else if (path.endsWith('/seller/mall/account')) result = { source: { id: 'mall', name: '에코디몰 내 판매내역', scope: 'seller-account' } };
      else if (path.includes('/seller/mall/report?')) result = { rows: [{ orderId: 'ORDER-A', gross: 10000, net: 9200, status: 'unconfirmed' }],
        source: '에코디몰', fetchedAt: new Date().toISOString(), complete: true, payoutVerificationAvailable: false };
      else if (path.endsWith('/requests/inspect')) result = { merchant: '테스트상점', amount: 27000, expiresAt: new Date().toISOString() };
      else throw new Error('Unexpected fixture API call: ' + path);
      return { ok: true, json: async () => result };
    },
  };
  // Intentionally no bundler helpers in this isolated browser-like global.
  vm.runInNewContext(source, context);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(nodes['#login'].hidden, true);
  assert.equal(nodes['#connection'].textContent, '기능 연결 설정됨');
  assert.doesNotMatch(nodes['#notice'].textContent, /처리하지 못/);
  if (mode === 'wallet') {
    assert.equal(nodes['#cards'].children.length, 1);
    assert.ok(readyButtons.every(button => !button.disabled));
  } else assert.ok(!calls.some(path => path.endsWith('/wallet')));
  if (mode === 'request') {
    assert.equal(nodes['#requestAmount'].textContent, '27,000원');
    assert.equal(nodes['#acceptRequest'].disabled, false);
  }
  if (mode === 'seller') {
    assert.equal(nodes['#workspaceId'].children[0].textContent, mall ? '에코디몰 내 판매내역' : '테스트매장');
    if (mall) {
      assert.equal(nodes['#paid'].textContent, '입금 자료 미연결');
      assert.equal(nodes['#net'].textContent, '9,200원');
      assert.ok(calls.some(path => path.includes('/seller/mall/report?')));
      assert.ok(!calls.some(path => path.includes('workspaceId=')));
    }
  }
}

test('browser payload is self-contained and boots all four views', async () => {
  for (const mode of ['wallet', 'send', 'request', 'seller']) await bootInFixture(webPayClientSource(), mode);
  await bootInFixture(webPayClientSource(), 'seller', true);
});
test('actual Wrangler output preserves browser payload closure', { skip: !process.env.EKODIPAY_WEB_BUNDLE }, async () => {
  const bundle = await import(pathToFileURL(process.env.EKODIPAY_WEB_BUNDLE));
  const response = await bundle.default.fetch(new Request('https://ekodi.kr/ekodipay/web.js'));
  assert.equal(response.status, 200);
  const source = await response.text();
  assert.doesNotMatch(source, /__name\(/);
  for (const mode of ['wallet', 'send', 'request', 'seller']) await bootInFixture(source, mode);
  await bootInFixture(source, 'seller', true);
});
