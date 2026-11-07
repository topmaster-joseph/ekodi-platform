import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const script = await readFile(new URL('../script.js', import.meta.url), 'utf8');
const formerLifeJs = await readFile(new URL('../church-life-hub.js', import.meta.url), 'utf8');
const devotion = await readFile(new URL('../devotion/index.html', import.meta.url), 'utf8');

test('the legacy life record hub is no longer a separate public Church experience', () => {
  assert.doesNotMatch(html, /data-ekodi-life-hub|id="life-hub"|id="daily-devotion"|id="life-reflection-form"|id="memory-form"|id="witness-form"/);
  assert.doesNotMatch(html, /href="#life-hub"|church-life-hub\.js|church-life-hub\.css/);
  assert.match(html, /<strong>매일묵상<\/strong>/);
  assert.match(html, /href="\/ekodichurch\/devotion\/"[^>]*>/);
  assert.match(devotion, /<h1>에코디 오늘의 매일묵상<\/h1>/);
});

test('old life-hub and daily-devotion bookmarks return to one canonical page', () => {
  assert.match(script, /location\.hash === '#life-hub'/);
  assert.match(script, /location\.hash === '#daily-devotion'/);
  assert.match(script, /location\.replace\('\/ekodichurch\/devotion\/' \+ location\.search\)/);
});

test('pre-existing private records are not deleted as part of the visible retirement', () => {
  assert.match(formerLifeJs, /ekodi\.church\.life\.v1/);
  assert.match(formerLifeJs, /localStorage\.setItem/);
  assert.doesNotMatch(script, /localStorage\.(?:clear|removeItem)\s*\(/);
  assert.doesNotMatch(html, /이 기기 기록 비우기|묵상·안부·추억·증언 기록은 먼저/);
});

test('community, mission, and EKODI Live remain independent public destinations', () => {
  assert.ok(html.includes('에코디선교회'));
  assert.ok(html.includes('선교 · 섬김 · 후원'));
  assert.ok(html.includes('href="/live/church/"'));
  assert.ok(html.includes('href="/ekodichurch/#together"'));
  assert.doesNotMatch(html, /meet\.jit\.si|EKODIChurchLive/);
});
