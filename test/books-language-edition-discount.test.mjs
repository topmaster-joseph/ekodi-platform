// BOOKS-LANGUAGE-EDITION-DISCOUNT-001 — 같은 책의 다른 언어판 보유 시 50% 할인 (서버 계산)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { otherLanguageEditions, applyLanguageEditionDiscount, languageEditionRate, ownedOtherLanguageEdition } from '../books-language-editions.js';
import { priceFor, quote, createOrder } from '../books-commerce.js';
import { saleReadiness } from '../books-sale-readiness.js';

const catalog = JSON.parse(fs.readFileSync(new URL('../books/books.json', import.meta.url), 'utf8'));
const policy = JSON.parse(fs.readFileSync(new URL('../books/commerce.json', import.meta.url), 'utf8'));
const byId = id => catalog.books.find(b => b.id === id);
const ko = byId('BOOK-EKODI-000001'), en = byId('BOOK-EKODI-000003');

function d1() {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(new URL('../migrations/0010_books_channel_finance.sql', import.meta.url), 'utf8').split('INSERT OR IGNORE')[0]);
  db.exec(fs.readFileSync(new URL('../migrations/202610271400_books_direct_commerce.sql', import.meta.url), 'utf8'));
  const stmt = (sql, args = []) => ({ bind: (...a) => stmt(sql, a), first: async () => db.prepare(sql).get(...args) ?? null, all: async () => ({ results: db.prepare(sql).all(...args) }), run: async () => { db.prepare(sql).run(...args); return {}; } });
  return { raw: db, prepare: sql => stmt(sql), batch: async l => { for (const s of l) await s.run(); } };
}
const grant = (db, userId, bookId, revoked = null) => db.raw.prepare('INSERT INTO books_entitlements (buyer_user_id, book_id, order_id, buyer_email, granted_at, revoked_at) VALUES (?,?,?,?,?,?)').run(userId, bookId, 'EKB-x-' + bookId, 'r@example.com', '2026-10-31', revoked);

test('English edition is catalogued as a separate edition of the same work, not yet for sale', () => {
  assert.equal(en.workId, ko.workId);
  assert.equal(en.language, 'en');
  assert.equal(ko.language, 'ko');
  assert.equal(en.links.amazon, '', 'no invented Amazon link');
  assert.equal(en.identifiers.amazonAsin, '', 'no invented ASIN');
  assert.equal(en.listPrice.amount, 0, 'price is a human decision, not invented');
  assert.equal(saleReadiness(en).ready, false);
  assert.deepEqual(otherLanguageEditions(catalog, ko).map(b => b.id), ['BOOK-EKODI-000003']);
  assert.deepEqual(otherLanguageEditions(catalog, en).map(b => b.id), ['BOOK-EKODI-000001']);
  assert.deepEqual(otherLanguageEditions(catalog, byId('BOOK-EKODI-000002')), [], 'different work never qualifies');
});

test('50% of list price, both directions, and for any future language', () => {
  assert.equal(languageEditionRate(policy), 0.5);
  const enPriced = { ...en, listPrice: { currency: 'KRW', amount: 9900 } };
  const base = priceFor(enPriced, policy, 'member');
  const d = applyLanguageEditionDiscount(base, policy, ko);
  assert.equal(d.amount, 5000); // 4,950 → 100원 단위 반올림
  assert.equal(d.tierId, 'language-edition');
  assert.equal(d.languageEdition.sourceBookId, ko.id);
  const zh = { ...ko, id: 'BOOK-X-ZH', language: 'zh' }, vi = { ...ko, id: 'BOOK-X-VI', language: 'vi' };
  const cat = { books: [ko, zh, vi] };
  assert.deepEqual(otherLanguageEditions(cat, vi).map(b => b.id).sort(), ['BOOK-EKODI-000001', 'BOOK-X-ZH']);
  assert.equal(applyLanguageEditionDiscount(priceFor(vi, policy, 'member'), policy, zh).amount, 5000);
});

test('does not stack with member tiers; same language or missing workId never qualifies', () => {
  const p = priceFor(ko, policy, 'subscriber'); // 30% → 6,900
  assert.equal(applyLanguageEditionDiscount(p, policy, en).amount, 5000, 'lower of the two');
  assert.equal(applyLanguageEditionDiscount({ ...p, amount: 4000 }, policy, en).amount, 4000, 'keeps a lower tier price');
  assert.deepEqual(otherLanguageEditions({ books: [ko, { ...ko, id: 'BOOK-KO-2' }] }, ko), []);
  assert.deepEqual(otherLanguageEditions(catalog, { ...ko, workId: '' }), []);
  assert.equal(languageEditionRate({ languageEditionDiscount: { rate: 5 } }), 0.5, 'invalid rate falls back');
});

test('only an active (non-revoked) entitlement of another language qualifies', async () => {
  const db = d1();
  const buyer = { userId: 'u1' };
  assert.equal(await ownedOtherLanguageEdition({ DB: db }, buyer, catalog, en), null);
  grant(db, 'u1', ko.id, '2026-10-31T10:00:00Z');
  assert.equal(await ownedOtherLanguageEdition({ DB: db }, buyer, catalog, en), null, 'refunded/revoked does not count');
  grant(db, 'u2', ko.id);
  assert.equal((await ownedOtherLanguageEdition({ DB: db }, { userId: 'u2' }, catalog, en)).id, ko.id);
  assert.equal(await ownedOtherLanguageEdition({ DB: db }, { userId: 'u2' }, catalog, ko), null, 'owning ko does not discount ko');
});

test('server quote and order apply the discount for an owner of the other edition', async () => {
  const user = { id: 'u-en', email: 'reader@example.com', email_confirmed_at: '2026-01-01', user_metadata: {} };
  const real = globalThis.fetch;
  globalThis.fetch = async url => String(url).includes('/auth/v1/user') ? new Response(JSON.stringify(user)) : real(url);
  try {
    // Simulate a future state where the English edition is sold here and the Korean edition is bought second.
    const db = d1();
    grant(db, 'u-en', en.id);
    const env = { DB: db, ASSETS: { fetch: async r => new Response(JSON.stringify(new URL(r.url).pathname === '/books.json' ? catalog : policy)) }, BOOK_FILES: { head: async () => ({ size: 1 }) }, PAYMENTS_ENABLED: 'true', TOSS_CLIENT_KEY: 'live_ck_a', TOSS_SECRET_KEY: 'live_sk_a', PUBLIC_BASE_URL: 'https://ekodi.kr/books' };
    const req = () => new Request('https://ekodi.kr/books/api/commerce/orders', { method: 'POST', headers: { authorization: 'Bearer t' } });
    const q = await quote(env, req(), ko.id);
    assert.equal(q.data.price.amount, 5000);
    assert.equal(q.data.languageEdition.applied, true);
    const o = await createOrder(env, req(), { bookId: ko.id, consent: true });
    assert.equal(o.status, 201);
    assert.equal(o.data.amount, 5000);
    assert.equal(db.raw.prepare('SELECT tier_id, amount, list_price FROM books_orders').get().tier_id, 'language-edition');
    // English edition is not purchasable yet (no publisher release, no price, no file approval).
    const blocked = await createOrder(env, req(), { bookId: en.id, consent: true });
    assert.notEqual(blocked.status, 201);
  } finally { globalThis.fetch = real; }
});
