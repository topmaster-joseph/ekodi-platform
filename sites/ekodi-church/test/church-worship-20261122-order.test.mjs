import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../worship/bulletin-data.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../worship/bulletin-layout-20261122.css', import.meta.url), 'utf8');
const rules = readFileSync(new URL('../worship/WEEKLY_RULES.md', import.meta.url), 'utf8');
const old = readFileSync(new URL('../worship/2026-11-08/index.html', import.meta.url), 'utf8');
const expected = [
  '경배찬양', '예배부름', '공동고백', '입례찬송', '대표기도',
  '헌금찬송', '말씀봉독', '말씀찬송', '말씀선포', '말씀기도',
  '결단찬송', '교회소식', '파송찬송', '주기도문'
];
test('Nov 22 worship order is exactly fourteen bilingual steps in requested sequence', () => {
  const block = source.match(/const newOrder = \[([\s\S]*?)\n  \];/)?.[1];
  assert.ok(block, 'canonical, effective-dated worship order');
  const items = Array.from(block.matchAll(/^\s*\['([^']+)',\s*(?:'([^']+)'|"([^"]+)"),/gm));
  assert.deepEqual(items.map(m => m[1]), expected);
  assert.equal(items.length, 14);
  for (const match of items) assert.ok((match[2] || match[3]).length > 4, 'English must be present');
});
test('layout places service order in top right, keeps one question, and leaves archive intact', () => {
  assert.match(source, /const orderEffectiveDate = '2026-11-22'/);
  assert.match(source, /if \(!hasNewOrder\) return/);
  assert.match(source, /right\.prepend\(order\)/);
  assert.match(source, /left\.prepend\(sponsorsHeading, sponsors\)/);
  assert.match(source, /left\.append\(questionsHeading, questions\)/);
  assert.match(source, /slice\(0, hasNewOrder \? 1 : undefined\)/);
  assert.match(source, /querySelectorAll\('li'\)\)\.slice\(1\)/);
  assert.match(css, /data-worship-layout="2026-11-22"/);
  assert.match(rules, /2026년 11월 22일/);
  assert.match(old, /<td>예배부름<\/td><th>Call to Worship<\/th>/);
  assert.doesNotMatch(old, /Processional Hymn/);
});

test('Nov 22 draft bulletin is two-sheet, sanitized and guarded', () => {
  const html = readFileSync(new URL('../worship/2026-11-22/index.html', import.meta.url), 'utf8');
  const stage = readFileSync(new URL('../worship/2026-11-22/worship.js', import.meta.url), 'utf8');
  const manifest = JSON.parse(readFileSync(new URL('../worship/2026-11-22/materials.json', import.meta.url), 'utf8'));
  const weekly = JSON.parse(readFileSync(new URL('../worship/weekly.json', import.meta.url), 'utf8'));
  assert.equal((html.match(/class="bp-sheet"/g) || []).length, 2);
  assert.equal((html.match(/<tr><td>경배찬양<\/td>/g) || []).length, 1);
  assert.equal((html.match(/<li>성령께서 내게/g) || []).length, 1);
  assert.match(html, /\.\.\/bulletin-data\.js\?v=20261122a/);
  assert.match(html, /\.\.\/review-gate\.js/);
  assert.doesNotMatch(html, /임진명|국화축제|sb_secret|service_role|stream_key/);
  assert.match(html, /<h1 id="worship-title">공동의 유익을 위한 은사<\/h1>/);
  assert.match(stage, /2026-11-22/);
  assert.match(stage, /'ekodi-church-worship-20261122'/);
  assert.equal(manifest.status, 'draft');
  assert.equal(manifest.reviewRequired, true);
  assert.equal(weekly.services.some(x => x.date === '2026-11-22'), false, 'draft stays out of published weekly index until pastor approval');
});
