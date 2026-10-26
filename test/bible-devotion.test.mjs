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
  assert.equal((await worker.fetch(new Request('https://ekodi.kr/bible/api/bible/devotion?date=2099-11-03'), assetEnv())).status, 403);
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
  assert.match(html, /data-ekodi-devotion data-base="\/bible\/devotion"/);
  assert.match(html, /<h1>오늘의 매일묵상<\/h1>/);
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

test('shared renderer keeps canonical Scripture visible and merges response sections', () => {
  const js = fs.readFileSync(new URL('devotion.js', bibleDir), 'utf8');
  for (const id of ['poem','song','image','questions','family','prayer']) assert.ok(js.includes(`id: '${id}'`), id);
  for (const former of ['passage','action','mine']) assert.equal(js.includes(`id: '${former}'`), false, former);
  assert.match(js, /renderPassage\(scriptureBlock, data\)/);
  assert.match(js, /panels\.get\(tabId\)\.hidden = !on/);
  assert.match(js, /data-date-mode|dateMode === 'query'/);
  assert.match(js, /renderScore\(score,a\.song\.abc\)/);
  assert.match(js, /setupMrPlayer\(a\.song\)/);
  assert.match(js, /renderAdminEditor\(data\)/);
});

test('church and mission devotion pages mount the shared renderer with their own chrome', () => {
  const mission = fs.readFileSync(new URL('../space/ekodimission-devotion.page', import.meta.url), 'utf8');
  assert.match(mission, /<h1>오늘의 매일묵상<\/h1>/);
  assert.match(mission, /class="mission-site-header"/);
  assert.match(mission, /data-ekodi-devotion data-base="\/ekodimission\/devotion" data-date-mode="query"/);
  assert.match(mission, /<script type="module" src="\/bible\/devotion\.js"><\/script>/);
  assert.doesNotMatch(mission, /style="/);
  assert.match(fs.readFileSync(new URL('../space-worker.js', import.meta.url), 'utf8'), /\['\/ekodimission\/devotion','\/ekodimission-devotion\.page'\]/);
  assert.match(fs.readFileSync(new URL('../space/ekodimission-shell.js', import.meta.url), 'utf8'), /href:'\/ekodimission\/devotion',label:'매일묵상'/);
});

test('future content is not exposed to unauthenticated clients or link crawlers',async()=>{
  const api=await worker.fetch(new Request('https://ekodi.kr/bible/api/bible/devotion?date=2099-01-01'),assetEnv());
  assert.equal(api.status,403);
  assert.equal((await api.json()).error,'future_unavailable');
  const preview=await worker.fetch(new Request('https://ekodi.kr/bible/devotion/2099-01-01'),assetEnv());
  assert.equal(preview.status,200);
  const html=await preview.text();
  assert.doesNotMatch(html,/2099-01-01.*오바댜/);
  assert.match(html,/오늘의 매일묵상/);
});
test('attribution and October original score are present',()=>{
  assert.equal(activities.notice,'묵상 적용(시·노래·질문·기도)은 에코디언 정찬균목사가 공통본문을 바탕으로 AI 도움을 받아 만든 창작 묵상 자료입니다. 성경 본문은 개역한글(대한성서공회, 1961) 원문을 그대로 표시합니다.');
  const song=activities.days.find(d=>d.day===26)?.song;
  assert.match(song?.abc||'',/^X:1/);
  assert.match(song.abc,/K:G/);
  assert.ok(fs.existsSync(new URL('devotion-illustration.svg',bibleDir)));
});

test('page order: Scripture, tabs and panel, attribution, share — no summary card or standalone MR row', () => {
  const js = fs.readFileSync(new URL('devotion.js', bibleDir), 'utf8');
  const line = js.match(/root\.append\(([^)]*)\);/)[1].split(',').map(s => s.trim());
  assert.deepEqual(line, ['datebar', 'status', 'scriptureBlock', 'tabbar', 'panelWrap', 'notice', 'shareRow', 'adminPanel', 'toastEl']);
  assert.doesNotMatch(js, /사용 권한이 확인된 반주 음원이 아직 등록되지 않았습니다/);
  assert.match(js, /panels\.get\('song'\) \|\| root\)\.append\(audioRow\)/);
});

test('mission devotion header spans the same 840px centre column as the content', () => {
  const css = fs.readFileSync(new URL('devotion.css', bibleDir), 'utf8');
  assert.match(css, /\.ekodi-devotion\{[^}]*max-width:840px/);
  assert.match(css, /body:has\(\[data-mission-devotion\]\) \.mission-site-header\{max-width:840px;padding-inline:16px\}/);
});
