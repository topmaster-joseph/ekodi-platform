import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import worker from '../bible-worker.js';
import { resolveDevotion, passageParts, isDevotionDate } from '../devotional-activities.js';
import { commonScriptureSnapshot } from '../common-scripture-registry.js';

const activities = JSON.parse(fs.readFileSync(new URL('../config/devotional-activities/2026-10.json', import.meta.url), 'utf8'));
const bibleDir = new URL('../bible/', import.meta.url);
// The EKODI shell injector uses the Workers HTMLRewriter; pass responses through in Node.
if (typeof globalThis.HTMLRewriter === 'undefined') globalThis.HTMLRewriter = class { on() { return this; } transform(response) { return response; } };

function assetEnv() {
  return {
    DATA_ENABLED: 'false', DATA_MODE: 'test',
    ASSETS: {
      async fetch(input) {
        const path = new URL(input.url).pathname;
        const file = path === '/devotion' ? 'devotion.html' : path.replace(/^\//, '');
        const target = new URL(file, bibleDir);
        if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) return new Response('not found', { status: 404 });
        const type = file.endsWith('.html') ? 'text/html; charset=utf-8' : file.endsWith('.json') ? 'application/json' : 'text/plain';
        return new Response(fs.readFileSync(target), { status: 200, headers: { 'content-type': type } });
      },
    },
  };
}

test('October activities cover every approved common-scripture day exactly', () => {
  const registry = commonScriptureSnapshot('2026-10');
  assert.equal(activities.days.length, registry.readings.length);
  for (const reading of registry.readings) {
    const day = activities.days.find(item => item.day === reading.day);
    assert.ok(day, `missing day ${reading.day}`);
    assert.equal(day.passage, reading.passage, `day ${reading.day} passage must match registry`);
    assert.ok(day.keyLine && day.theme && day.family && day.action && day.prayer);
    assert.ok(day.poem.lines.length >= 6, `day ${reading.day} poem`);
    assert.ok(day.song.verse.length >= 4 && day.song.refrain.length >= 2, `day ${reading.day} song`);
    assert.equal(day.questions.length, 3);
    assert.deepEqual(day.questions.map(q => q.kind), ['마음', '관계', '삶']);
  }
});

test('resolveDevotion returns curated activities and a canonical share URL', () => {
  const d = resolveDevotion('2026-10-26');
  assert.equal(d.found, true);
  assert.equal(d.passage, '오바댜 1:17-21');
  assert.equal(d.activitySource, 'curated');
  assert.equal(d.shareUrl, 'https://ekodi.kr/bible/devotion/2026-10-26');
  assert.equal(d.prevDate, '2026-10-25');
  assert.equal(d.nextDate, '2026-10-27');
  assert.equal(d.activities.day, undefined);
});

test('unregistered and invalid dates fail closed', () => {
  assert.equal(resolveDevotion('2026-11-01').error, 'scripture_not_registered');
  assert.equal(resolveDevotion('2026-02-30').error, 'invalid_date');
  assert.equal(resolveDevotion('<script>').error, 'invalid_date');
  assert.equal(isDevotionDate('2026-10-31'), true);
  assert.equal(isDevotionDate('2026-13-01'), false);
});

test('cross-chapter passages split into readable chapter parts', () => {
  assert.deepEqual(passageParts('신명기 31:30-32:14'), ['신명기 31:30-999', '신명기 32:1-14']);
  assert.deepEqual(passageParts('고린도전서 1:26-2:5'), ['고린도전서 1:26-999', '고린도전서 2:1-5']);
  assert.deepEqual(passageParts('오바댜 1:1-9'), ['오바댜 1:1-9']);
});

test('devotion API returns verbatim KRV verses for a cross-chapter day', async () => {
  const response = await worker.fetch(new Request('https://ekodi.kr/bible/api/bible/devotion?date=2026-10-13'), assetEnv());
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.passage, '신명기 31:30-32:14');
  assert.equal(body.scripture.length, 2);
  assert.ok(body.scripture.every(part => part.ok && part.integrity === 'verbatim'));
  assert.equal(body.scripture[0].verses.length, 1);
  assert.equal(body.scripture[1].verses.length, 14);
  assert.match(response.headers.get('cache-control'), /max-age=300/);
});

test('devotion API rejects invalid dates and 404s unregistered months', async () => {
  assert.equal((await worker.fetch(new Request('https://ekodi.kr/bible/api/bible/devotion?date=2026-99-99'), assetEnv())).status, 400);
  assert.equal((await worker.fetch(new Request('https://ekodi.kr/bible/api/bible/devotion?date=2026-11-03'), assetEnv())).status, 404);
});

test('dated share link renders KakaoTalk-ready Open Graph tags without HTML injection', async () => {
  const response = await worker.fetch(new Request('https://ekodi.kr/bible/devotion/2026-10-25'), assetEnv());
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>에코디 매일묵상 · 오바댜 1:10-16<\/title>/);
  assert.match(html, /property="og:title" content="에코디 매일묵상 · 오바댜 1:10-16"/);
  assert.match(html, /property="og:url" content="https:\/\/ekodi\.kr\/bible\/devotion\/2026-10-25"/);
  assert.match(html, /property="og:description" content="[^"]*멀찍이/);
  assert.doesNotMatch(html, /EKODI_DEVOTION_META/);
  assert.match(html, /data-share="poem"/);
});

test('bare devotion route serves today and invalid date paths are 404', async () => {
  const today = await worker.fetch(new Request('https://ekodi.kr/bible/devotion'), assetEnv());
  assert.equal(today.status, 200);
  assert.match(await today.text(), /에코디 매일묵상/);
  const bad = await worker.fetch(new Request('https://ekodi.kr/bible/devotion/%3Cscript%3E'), assetEnv());
  assert.equal(bad.status, 404);
  assert.doesNotMatch(await bad.text(), /<script>alert/);
});

test('devotion assets ship without inline script or style (CSP self-only)', () => {
  const html = fs.readFileSync(new URL('devotion.html', bibleDir), 'utf8');
  assert.doesNotMatch(html, /<script(?![^>]*src=)[^>]*>/);
  assert.doesNotMatch(html, /<style|style="/);
  assert.match(fs.readFileSync(new URL('index.html', bibleDir), 'utf8'), /href="\/bible\/devotion"/);
});
