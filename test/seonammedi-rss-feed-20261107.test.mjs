import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { seonammediRssXml, seonammediLiveRssXml } from '../seonammedi-domain-gateway.js';

const IDN = 'xn--3e0b8b58jw4co4mnpll3k.kr';
const payload = {
  ok: true, boardId: 'seonammedi.notice',
  items: [
    { id: 7, status: 'published', title: '기자회견 <안내> & 일정', body: '<p>본문   요약</p>', createdAt: '2026-11-05T01:02:03Z' },
    { id: 8, status: 'draft', title: '비공개 초안', body: 'secret' },
    { id: 7, status: 'published', title: '중복' },
    { id: -1, status: 'published', title: '잘못된 id' },
  ],
};

test('RSS lists only published notices on the requesting host, escaped', () => {
  const xml = seonammediRssXml(payload, IDN);
  assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>\n<rss version="2.0">/);
  assert.match(xml, /<link>https:\/\/xn--3e0b8b58jw4co4mnpll3k\.kr\/board\/notices\/7<\/link>/);
  assert.match(xml, /<title>기자회견 &lt;안내&gt; &amp; 일정<\/title>/);
  assert.match(xml, /<description>본문 요약<\/description>/);
  assert.match(xml, /<pubDate>Thu, 05 Nov 2026 01:02:03 GMT<\/pubDate>/);
  assert.equal((xml.match(/<item>/g) || []).length, 1);
  assert.ok(!xml.includes('secret') && !xml.includes('비공개'));
  assert.match(seonammediRssXml(payload, 'seonammedi.kr'), /https:\/\/seonammedi\.kr\/board\/notices\/7/);
});

test('RSS fails closed to an empty valid channel', async () => {
  for (const bad of [null, { ok: false }, { ok: true, boardId: 'other', items: [{ id: 1, status: 'published' }] }]) {
    const xml = seonammediRssXml(bad, IDN);
    assert.match(xml, /<channel>[\s\S]*<title>서남권국립의대<\/title>[\s\S]*<\/channel>/);
    assert.ok(!xml.includes('<item>'));
  }
  assert.ok(!(await seonammediLiveRssXml(async () => { throw new Error('down'); }, IDN)).includes('<item>'));
  assert.ok(!(await seonammediLiveRssXml(async () => new Response('x', { status: 500 }), IDN)).includes('<item>'));
});

test('HEAD /rss.xml is a static side-effect-free response', async () => {
  const response = await worker.fetch(new Request(`https://${IDN}/rss.xml`, { method: 'HEAD' }));
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /application\/rss\+xml/);
  assert.equal(response.headers.get('x-ekodi-route'), 'seonammedi-rss');
});

test('home page advertises the canonical RSS feed for crawler discovery', async () => {
  const { readFile } = await import('node:fs/promises');
  const html = await readFile(new URL('../sites/seonammedi/public/index.html', import.meta.url), 'utf8');
  assert.match(html, /<link rel="alternate" type="application\/rss\+xml" title="서남권국립의대 공지" href="https:\/\/xn--3e0b8b58jw4co4mnpll3k\.kr\/rss\.xml">/);
});
