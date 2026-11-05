import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('mission home shows current event without duplicate recurring copy', async () => {
  const [home, saturday] = await Promise.all([
    read('space/ekodimission.page'),
    read('space/ekodimission-saturday.js')
  ]);
  assert.match(home, /id="mission-next-event">이번 주 토요모임<\/h2>/);
  assert.doesNotMatch(home, /2024년 2월 3일부터 이어온 정기모임/);
  assert.doesNotMatch(home, /class="mission-weekly-label"/);
  assert.doesNotMatch(home, /<h2 id="mission-next-event">[^<]*<\/h2><p>/);
  assert.doesNotMatch(saturday, /2024년 2월 3일부터 이어온 정기모임|sectionNote/);
  assert.match(saturday, /timeLabel\.textContent=meetingTime/);
  assert.match(saturday, /timeFact\.textContent='토요일 '\+meetingTime/);
});

test('shared traffic footer separates metrics and wraps note on narrow screens', async () => {
  const footer = await read('shell/user-ui-footer.js');
  assert.match(footer, /column-gap:28px!important;row-gap:10px!important/);
  assert.match(footer, /column-gap:20px!important;row-gap:8px!important/);
  assert.match(footer, /\.ekodi-footer-traffic__note\{flex-basis:100%!important/);
  assert.match(footer, /addTrafficMetric\(node,english\?'Today':'오늘 방문',data\.today\)/);
  assert.match(footer, /addTrafficMetric\(node,english\?'7 days':'최근 7일',data\.last7Days\)/);
  assert.match(footer, /addTrafficMetric\(node,english\?'30 days':'최근 30일',data\.last30Days\)/);
});
