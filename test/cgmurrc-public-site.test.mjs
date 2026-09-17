import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const page=fs.readFileSync('cgmurrc.html','utf8');
const build=fs.readFileSync('scripts/build.mjs','utf8');

test('cgmurrc public site is grounded, privacy-safe and build-owned',()=>{
  assert.match(page,/무안군 청계면 도시재생사업 주민협의체/);
  assert.match(page,/227,900㎡/);
  assert.match(page,/2024–2027/);
  assert.match(page,/312억원/);
  assert.match(page,/상권활성화분과/);
  assert.match(page,/주거환경개선분과/);
  assert.match(page,/문화공동체분과/);
  assert.match(page,/2026년 운영규칙 개정안/);
  assert.match(page,/최종 의결·시행 전에는 현행 운영규칙/);
  assert.match(page,/회원명단, 연락처, 내부용 운영위원 자료/);
  assert.doesNotMatch(page,/107명|010[-\s]?\d{3,4}[-\s]?\d{4}/);
  assert.match(build,/["']cgmurrc\.html["']/);
});
