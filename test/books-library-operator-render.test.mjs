// LIBRARY-OPERATOR-RENDER-001 — overlapping operator-panel refreshes must never duplicate book rows.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('concurrent operator panel runs render each direct-sale book exactly once', async () => {
  const original = fs.readFileSync(new URL('../books/buy/library.js', import.meta.url), 'utf8');
  // simulate the overlapping refreshes seen in production (initial load + sign-in/post-upload refresh)
  const src = original.replace('load().then(operatorPanel);', 'load().then(operatorPanel);operatorPanel();');
  assert.notEqual(src, original);
  class El { constructor(t) { this.tag = t; this.children = []; this.hidden = true; this.style = {}; this.classList = { add() {}, toggle() {} }; this.textContent = ''; this.firstChild = { textContent: '' }; }
    append(...c) { this.children.push(...c); } appendChild(c) { this.children.push(c); }
    replaceChildren(...c) { this.children = c.flatMap(x => x.tag === '#frag' ? x.children : [x]); }
    addEventListener() {} setAttribute() {} insertAdjacentElement() {} querySelector() { return new El('x'); } querySelectorAll() { return []; } }
  const els = {};
  const document = { getElementById: id => els[id] || (els[id] = new El(id)), createElement: t => new El(t), createDocumentFragment: () => new El('#frag'), querySelectorAll: () => [] };
  const catalog = JSON.parse(fs.readFileSync(new URL('../books/books.json', import.meta.url), 'utf8'));
  let signIn;
  const C = { BASE: '/books', api: async p => { await new Promise(r => setTimeout(r, 5 + Math.random() * 15)); if (p.startsWith('admin/files')) return { present: true, size: 1e6, uploaded: Date.now() }; if (p === 'library') return { books: [], email: 'op@ekodi.kr' }; return {}; },
    mountGoogle: (_n, _s, cb) => { signIn = cb; }, session: async () => ({}), forget() {}, won: x => x, cover: () => new El('img'), under: x => x };
  const ctx = { window: { EkodiBooksCommerce: C }, document, fetch: async () => ({ json: async () => catalog }), location: { pathname: '/books/library/', search: '' }, alert() {}, console, setTimeout, URLSearchParams, Promise };
  vm.runInNewContext(src, ctx);
  await new Promise(r => setTimeout(r, 400));
  const expected = catalog.books.filter(b => b.directSale?.enabled).length;
  assert.equal(els.operatorBooks.children.length, expected);
  assert.match(original, /if \(run === operatorRun\) \$\('operatorBooks'\)\.replaceChildren\(host\)/);
});
