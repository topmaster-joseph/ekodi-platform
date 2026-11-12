// BOOKS-PUBLISHING-CHROME-001: 출판·에코디서점의 머리말·꼬리말은 scripts/site-chrome.mjs 한 곳에서 나오고, 모든 페이지가 그대로 반영돼 있어야 한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SITES, plan, header, footer } from '../scripts/site-chrome.mjs';

const read = rel => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

test('every bookstore and publishing page carries the generated header and footer', () => {
  const drift = [...plan()].filter(([rel, content]) => read(rel) !== content).map(([rel]) => rel);
  assert.deepEqual(drift, [], 'run: node scripts/site-chrome.mjs');
});

test('both sites share one structure and differ only in identity', () => {
  for (const id of Object.keys(SITES)) {
    const h = header(id), f = footer(id);
    for (const part of ['ekc-network', 'ekc-masthead', 'ekc-brand', 'id="site-nav"', 'menu-button', 'ekc-cta']) assert.ok(h.includes(part), `${id} header ${part}`);
    for (const part of ['ekc-foot-grid', '출판 생태계', 'ekc-foot-base', 'id="year"', 'data-ekodi-social-links']) assert.ok(f.includes(part), `${id} footer ${part}`);
    assert.match(h, new RegExp(`aria-current="true"><b>${id === 'books' ? '에코디서점' : '에코디출판'}</b>`));
  }
  assert.notEqual(header('books'), header('publishing'));
  assert.match(footer('books'), /통신판매업 2023-전남무안-0153/, 'bookstore footer shows seller disclosure');
});

test('chrome links are canonical and never root literals the gateway would re-prefix', () => {
  for (const id of Object.keys(SITES)) {
    const html = header(id) + footer(id);
    assert.doesNotMatch(html, /href="\/(?!\/)/);
    assert.match(html,/에코디출판/,'first-party publisher must use its official EKODI identity');
  }
});

test('Toss merchant review: every Books page shows canonical seller phone in footer', () => {
  const f = footer('books');
  assert.match(f, /대표전화 010-3501-8542/);
  assert.match(f, /사업자등록번호 213-13-01959/);
  assert.match(f, /상호 에코디비즈 · 대표 정찬균/);
  assert.match(f, /전남광주통합특별시 무안군 청계면 백련동1길 17-4, 건물 1층/);
  for (const page of SITES.books.pages) {
    const html = read(page);
    assert.match(html, /대표전화 010-3501-8542/, page + ' merchant contact');
    assert.match(html, /문의 ekodibiz@gmail.com/, page + ' email contact');
  }
});
