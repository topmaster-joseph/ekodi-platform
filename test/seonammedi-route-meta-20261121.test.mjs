import test from 'node:test';
import assert from 'node:assert/strict';
import {
  seonammediRouteMeta,
  seonammediApplyRouteMeta,
  seonammediLiveRouteMeta,
} from '../seonammedi-domain-gateway.js';

const IDN = 'xn--3e0b8b58jw4co4mnpll3k.kr';
const SAMPLE_HTML = [
  '<!doctype html><html><head>',
  '<meta name="description" content="서남권국립의대(서남권 국립의대) 관련 공식자료, 활동이력, 관련보도, 시민 의견과 공개 정보를 확인할 수 있는 서남권국립의대 공식 사이트입니다.">',
  '<title>서남권국립의대 | 서남권 국립의대 · SEONAM MEDI</title>',
  '<link rel="canonical" href="https://xn--3e0b8b58jw4co4mnpll3k.kr/">',
  '<meta property="og:title" content="서남권국립의대 | 서남권 국립의대 · SEONAM MEDI">',
  '<meta property="og:description" content="기존 설명">',
  '</head><body></body></html>',
].join('\n');

const payload = {
  ok: true,
  boardId: 'seonammedi.notice',
  items: [
    { id: 7, status: 'published', title: '기자회견 <안내> & 일정', body: '<p>대통령실 앞 기자회견을   안내합니다.</p>' },
    { id: 8, status: 'draft', title: '비공개 초안', body: 'secret draft body' },
  ],
};

test('home and non-public routes get no route meta (home keeps its own tags)', () => {
  assert.equal(seonammediRouteMeta('/'), null);
  assert.equal(seonammediRouteMeta(''), null);
  assert.equal(seonammediRouteMeta('/admin/'), null);
  assert.equal(seonammediRouteMeta('/board/notices/0'), null);
  assert.equal(seonammediRouteMeta('/board/notices/abc'), null);
});

test('board list routes get distinct titles and descriptions', () => {
  const notices = seonammediRouteMeta('/board/notices');
  assert.match(notices.title, /^공지사항 \| 서남권국립의대 비상대책위원회$/);
  assert.ok(notices.description.length >= 50, 'description long enough for Bing');
  const voices = seonammediRouteMeta('/board/voices');
  assert.match(voices.title, /^시민의견 \| /);
  assert.notEqual(voices.description, notices.description);
});

test('notice detail uses the published post title and stripped body', () => {
  const meta = seonammediRouteMeta('/board/notices/7', payload);
  assert.equal(meta.title, '기자회견 <안내> & 일정 | 서남권국립의대 비상대책위원회');
  assert.equal(meta.description, '대통령실 앞 기자회견을 안내합니다.');
  assert.equal(meta.path, '/board/notices/7');
});

test('notice detail fails closed to section meta for drafts, unknown ids and bad payloads', () => {
  for (const [path, p] of [
    ['/board/notices/8', payload],            // draft never leaks
    ['/board/notices/99', payload],           // unknown id
    ['/board/notices/7', { ok: false }],      // upstream error contract
    ['/board/notices/7', { ok: true, boardId: 'other.board', items: payload.items }],
    ['/board/notices/7', null],
  ]) {
    const meta = seonammediRouteMeta(path, p);
    assert.match(meta.title, /^공지사항 \| /, path);
    assert.doesNotMatch(meta.description, /비공개|secret/, path);
  }
});

test('applyRouteMeta rewrites title, description, og tags and per-route canonical, escaped', () => {
  const meta = seonammediRouteMeta('/board/notices/7', payload);
  const html = seonammediApplyRouteMeta(SAMPLE_HTML, meta, IDN);
  assert.match(html, /<title>기자회견 &lt;안내&gt; &amp; 일정 \| 서남권국립의대 비상대책위원회<\/title>/);
  assert.match(html, /<meta name="description" content="대통령실 앞 기자회견을 안내합니다\."/);
  assert.match(html, /<meta property="og:title" content="기자회견 &lt;안내&gt; &amp; 일정 \| 서남권국립의대 비상대책위원회"/);
  assert.match(html, /<meta property="og:description" content="대통령실 앞 기자회견을 안내합니다\."/);
  assert.match(html, new RegExp('<link rel="canonical" href="https://xn--3e0b8b58jw4co4mnpll3k\\.kr/board/notices/7"'));
  assert.doesNotMatch(html, /SEONAM MEDI<\/title>/);
});

test('applyRouteMeta with null meta returns the HTML unchanged', () => {
  assert.equal(seonammediApplyRouteMeta(SAMPLE_HTML, null, IDN), SAMPLE_HTML);
});

test('liveRouteMeta fetches the notices API only for detail routes and fails closed', async () => {
  let calls = 0;
  const okFetch = async () => { calls += 1; return { ok: true, json: async () => payload }; };
  const listMeta = await seonammediLiveRouteMeta('/board/notices', okFetch);
  assert.equal(calls, 0, 'list route must not hit the API');
  assert.match(listMeta.title, /^공지사항 \| /);

  const detailMeta = await seonammediLiveRouteMeta('/board/notices/7', okFetch);
  assert.equal(calls, 1);
  assert.match(detailMeta.title, /^기자회견 /);

  const failMeta = await seonammediLiveRouteMeta('/board/notices/7', async () => { throw new Error('down'); });
  assert.match(failMeta.title, /^공지사항 \| /);

  assert.equal(await seonammediLiveRouteMeta('/', okFetch), null);
});
