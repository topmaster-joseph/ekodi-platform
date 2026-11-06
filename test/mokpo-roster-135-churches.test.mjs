import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const churches = JSON.parse(readFileSync('sites/mokpo-presbytery/data/churches.json', 'utf8'));
const home = readFileSync('sites/mokpo-presbytery/index.html', 'utf8');

test('135th roster groups every church under one of the five 시찰', () => {
  assert.deepEqual(Object.keys(churches), ['목포', '목포동', '신안', '신안동부', '함무']);
  assert.deepEqual(Object.values(churches).map((v) => v.length), [22, 35, 19, 28, 24]);
  const all = Object.values(churches).flat();
  assert.equal(all.length, 128);
  assert.equal(new Set(all).size, 128);
  assert.ok(churches['함무'].includes('에코디'));
  assert.ok(churches['신안동부'].includes('안좌대리'));
});

test('public church data and home page carry names only, no contact detail', () => {
  const raw = JSON.stringify(churches);
  for (const src of [raw, home]) {
    assert.doesNotMatch(src, /\d{2,3}-\d{3,4}-\d{4}|@(hanmail|naver|daum|gmail)\./);
    assert.doesNotMatch(src, /\b5\d{4}\s/);
  }
  assert.doesNotMatch(home, /시찰 확인 중/);
  assert.match(home, /산하교회<\/dt><dd>128곳/);
});
