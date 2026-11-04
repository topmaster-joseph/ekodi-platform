import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { PUBLIC_SALE_LISTING_WHERE, isPublicStaticSale } from './public-sale-visibility.js';

test('only currently purchasable curated or bookstore products appear on the public Mall', () => {
  const external = (overrides = {}) => ({
    published: true, status: '판매 중', saleType: 'publisher',
    action: { type: 'external', url: 'https://ekodi.kr/books/buy/?book=ready' }, ...overrides
  });
  assert.equal(isPublicStaticSale(external()), true);
  assert.equal(isPublicStaticSale(external({ status: '출간 준비' })), false);
  assert.equal(isPublicStaticSale(external({ published: false })), false);
  assert.equal(isPublicStaticSale(external({ action: { type: 'inquiry', url: 'https://ekodi.kr/books' } })), false);
  assert.equal(isPublicStaticSale(external({ action: { type: 'external', url: 'javascript:alert(1)' } })), false);
  assert.equal(isPublicStaticSale(external({ action: { type: 'external', url: '/internal/something' } })), false);
});

test('public D1 listing excludes pending, sold-out and unverified seller inventory', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`CREATE TABLE stores(id TEXT,verification_status TEXT);
      CREATE TABLE products(
        id TEXT,store_id TEXT,status TEXT,sale_type TEXT,affiliate_url TEXT,
        checkout_ready INTEGER,price INTEGER,stock_quantity INTEGER,seller_type TEXT
      );`);
    db.prepare('INSERT INTO stores VALUES (?,?)').run('verified-store','verified');
    db.prepare('INSERT INTO stores VALUES (?,?)').run('pending-store','pending');
    const add = db.prepare('INSERT INTO products VALUES (?,?,?,?,?,?,?,?,?)');
    add.run('personal-ready',null,'published','direct','',1,12000,5,'individual');
    add.run('business-ready','verified-store','published','direct','',1,25000,3,'business');
    add.run('business-unverified','pending-store','published','direct','',1,25000,3,'business');
    add.run('direct-unready',null,'published','direct','',0,22000,2,'individual');
    add.run('direct-out-of-stock',null,'published','direct','',1,22000,0,'individual');
    add.run('direct-no-price',null,'published','direct','',1,0,8,'individual');
    add.run('affiliate-ready',null,'published','affiliate','https://external.example/buy',0,0,0,'individual');
    add.run('affiliate-no-link',null,'published','affiliate','',0,0,0,'individual');
    add.run('affiliate-draft',null,'draft','affiliate','https://external.example/buy',0,0,0,'individual');
    const ids = db.prepare(`SELECT p.id FROM products p WHERE ${PUBLIC_SALE_LISTING_WHERE} ORDER BY p.id`).all().map((r) => r.id);
    assert.deepEqual(ids, ['affiliate-ready','business-ready','personal-ready']);
  } finally { db.close(); }
});
