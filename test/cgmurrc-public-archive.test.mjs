import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../cgmurrc.html', import.meta.url), 'utf8');

test('cgmurrc public archive exposes the curated operating record surface', () => {
  assert.match(html, /id="archive"/);
  assert.match(html, /data-content-collection="cgmurrc-public-records-v1"/);
  assert.match(html, /2025년 제1회 운영위원회/);
  assert.match(html, /임시총회 및 선진지 견학/);
  assert.match(html, /청계면 지역특화 도시재생 설명자료/);
  assert.match(html, /href="\/cgmurrc\/admin"/);
});

test('cgmurrc public archive does not ship sensitive source-document identifiers or direct contact data', () => {
  const forbidden = [
    '회원명부',
    '개인정보동의서',
    '개인정보 동의서',
    '참여 신청서.hwp',
    '참여 신청서.hwpx',
    '230612',
    '230228'
  ];
  for (const marker of forbidden) assert.equal(html.includes(marker), false, `public page must not contain: ${marker}`);
  assert.doesNotMatch(html, /01[016789]-\d{3,4}-\d{4}/);
  assert.doesNotMatch(html, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
});

test('cgmurrc archive does not link public visitors directly to Drive originals', () => {
  assert.doesNotMatch(html, /drive\.google\.com/i);
  assert.doesNotMatch(html, /docs\.google\.com/i);
});
