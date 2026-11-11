import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDevotionShareMessage, formatDevotionSectionShareMessage } from '../bible/devotion-share-audio.js';

const date = '2026-11-10';
const url = 'https://ekodi.kr/ekodimission/devotion?date=2026-11-10#poem';

test('devotional share has a common title with no label prefixes', () => {
  const result = formatDevotionShareMessage({
    date, title: '에코디언의 묵상나눔 · 로마서 12:1', excerpt: '그대로 살아냅니다', url,
  });
  assert.equal(result.split('\n')[0], '2026년 11월 10일 화요일');
  assert.equal(result.split('\n')[1], '에코디 묵상나눔');
  assert.match(result, /로마서 12:1/);
  assert.match(result, /그대로 살아냅니다/);
  assert.ok(result.endsWith(url));
  assert.doesNotMatch(result, /(?:일자|제목|내용|링크):/);
});

test('poem share preserves multiline content without redundant section labels', () => {
  const result = formatDevotionSectionShareMessage({
    date, title: '묵상 시 · 그대로', passage: '고린도전서 7:17-28', content: '다른 곳에 가야\n다른 사람이 되어야', url,
  });
  assert.match(result, /^2026년 11월 10일 화요일\n고린도전서 7:17-28\n에코디 묵상나눔\(묵상시\)\n/);
  assert.match(result, /\n〈그대로〉\n다른 곳에 가야\n다른 사람이 되어야\n/);
  assert.ok(result.endsWith(url));
  assert.doesNotMatch(result, /(?:일자|제목|내용|링크):|묵상 시 ·|묵상 노래 ·/);
});

test('sharing rejects external URL', () => {
  assert.throws(() => formatDevotionSectionShareMessage({
    date, title: '묵상 시 · 그대로', content: '본문', url: 'https://evil.example/poem',
  }), /invalid_devotion_url/);
});
