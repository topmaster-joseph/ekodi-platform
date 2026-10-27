// BOOKS-COMMERCE-CSP-001: 구매·내 서재 화면은 구글 로그인과 토스 결제 스크립트를 불러올 수 있어야 한다.
import test from 'node:test';
import assert from 'node:assert/strict';

class PassThroughRewriter { on() { return this; } onDocument() { return this; } transform(response) { return response; } }
globalThis.HTMLRewriter ??= PassThroughRewriter;
const { default: worker, isCommercePage } = await import('../books-worker.js');

const html = () => new Response('<!doctype html><html><head></head><body></body></html>', { headers: { 'content-type': 'text/html; charset=utf-8' } });
const env = { ASSETS: { fetch: async () => html() } };
const directive = (csp, name) => (csp.split(';').map(s => s.trim()).find(s => s.startsWith(name + ' ')) || '');

for (const path of ['/buy/', '/library/', '/buy/success/']) {
  test(`${path} allows Google sign-in, EKODI identity and Toss`, async () => {
    const res = await worker.fetch(new Request(`https://books.internal${path}`), env);
    const csp = res.headers.get('content-security-policy') || '';
    assert.match(directive(csp, 'script-src'), /https:\/\/accounts\.google\.com\/gsi\/client/);
    assert.match(directive(csp, 'script-src'), /https:\/\/js\.tosspayments\.com/);
    assert.match(directive(csp, 'connect-src'), /https:\/\/renzehysxirjilvdxacv\.supabase\.co/);
    assert.match(directive(csp, 'frame-src'), /https:\/\/accounts\.google\.com\/gsi\//);
    assert.match(directive(csp, 'frame-src'), /tosspayments\.com/);
    assert.equal(res.headers.get('x-ekodi-shell'), 'v2', 'shared shell still applied');
  });
}

test('catalog pages keep the default shell policy', async () => {
  assert.equal(isCommercePage('/'), false);
  assert.equal(isCommercePage('/buyers-guide/'), false);
  const res = await worker.fetch(new Request('https://books.internal/'), env);
  assert.doesNotMatch(res.headers.get('content-security-policy') || '', /tosspayments/);
});
