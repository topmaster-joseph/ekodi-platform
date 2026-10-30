import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SEONAMMEDI_SITEMAP_PATHS,
  seonammediPublicNoticeSitemapEntries,
  seonammediSitemapXml,
  seonammediLiveSitemapXml,
} from '../seonammedi-domain-gateway.js';

const IDN = 'https://xn--3e0b8b58jw4co4mnpll3k.kr';
const payload = {
  ok: true,
  boardId: 'seonammedi.notice',
  storage: 'independent-board-d1',
  items: [
    { id: 26, title: 'public document', body: 'private-looking free text', status: 'published', updatedAt: '2026-10-22T06:54:51.408Z' },
    { id: 26, title: 'duplicate', status: 'published', createdAt: '2026-10-22T06:54:51Z' },
    { id: 21, title: 'draft', status: 'draft' },
    { id: 22, title: 'deleted', status: 'deleted' },
    { id: 23, status: 'unlisted' },
    { id: '24', status: 'published' },
    { id: 0, status: 'published' },
    { id: -1, status: 'published' },
    { id: 15, status: 'published', updatedAt: 'bad-date' },
  ],
};

test('live Korean sitemap indexes public independent-board details, never deleted/draft content', () => {
  assert.deepEqual(seonammediPublicNoticeSitemapEntries(payload), [
    { path: '/board/notices/26', lastmod: '2026-10-22' },
    { path: '/board/notices/15', lastmod: '' },
  ]);
  const xml = seonammediSitemapXml(seonammediPublicNoticeSitemapEntries(payload));
  assert.ok(xml.includes('<loc>' + IDN + '/board/notices/26</loc><lastmod>2026-10-22</lastmod>'));
  assert.ok(xml.includes('<loc>' + IDN + '/board/notices/15</loc>'));
  assert.equal((xml.match(/board\/notices\/26/g) || []).length, 1);
  assert.doesNotMatch(xml, /board\/notices\/(21|22|23|24)/);
  assert.doesNotMatch(xml, /private-looking|draft|deleted|notice\.notice/);
  assert.doesNotMatch(xml, /seonammedi\.kr\//);
});

test('Korean sitemap stays static and valid when independent board is inaccessible', async () => {
  const staticXml = seonammediSitemapXml();
  assert.equal((staticXml.match(/<url>/g)||[]).length, SEONAMMEDI_SITEMAP_PATHS.length);
  const failed = await seonammediLiveSitemapXml(async () => { throw new Error('board unavailable'); });
  assert.equal(failed, staticXml);
  const rejected = await seonammediLiveSitemapXml(async () => ({ok:false, json:async()=>payload}));
  assert.equal(rejected, staticXml);
  const wrongStore = await seonammediLiveSitemapXml(async()=>({ok:true,json:async()=>({...payload, boardId:'private.finance'})}));
  assert.equal(wrongStore, staticXml);
});

test('live sitemap fetches only read-only public board list with no auth or private endpoint', async () => {
  let endpoint, options;
  const xml = await seonammediLiveSitemapXml(async (url, init) => {
    endpoint = url; options = init;
    return { ok: true, json: async () => payload };
  });
  assert.equal(endpoint, 'https://ekodi.kr/seonammedi/board/api/notices');
  assert.equal(options.method, 'GET');
  assert.equal(options.headers.accept, 'application/json');
  assert.ok(xml.includes(IDN + '/board/notices/26'));
  assert.ok(xml.includes(IDN + '/board/notices'));
  assert.ok(xml.includes(IDN + '/board/voices'));
  assert.ok(xml.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'));
});
