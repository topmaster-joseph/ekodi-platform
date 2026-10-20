// Regression (2026-10-20): notice photos were saved and served, but did not show
// on the home feed, link previews (KakaoTalk), the collapsed board list, or a
// notice detail page. These tests run the real board worker with a mocked D1/R2.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import worker from '../services/independent-board/worker.js';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const KEY = 'seonammedi/notices/22/photo.jpg';
const rows = [
  { id: 22, title: 'Test <공지>', body: '사진 테스트', pinned: 0, image_keys: JSON.stringify([KEY]), status: 'published', created_at: '2026-10-20T01:40:05.656Z', updated_at: '2026-10-20T01:40:05.656Z' },
  { id: 19, title: '사진 없는 공지', body: '본문', pinned: 0, image_keys: '[]', status: 'published', created_at: '2026-10-19T21:07:50.233Z', updated_at: '2026-10-19T21:07:50.233Z' },
  { id: 20, title: '삭제된 공지', body: '', pinned: 0, image_keys: JSON.stringify([KEY]), status: 'deleted', created_at: '2026-10-20T01:06:09.342Z', updated_at: '2026-10-20T01:30:25.600Z' },
];
const env = {
  BOARD_DB: { prepare: sql => { let args = []; return { bind(...a) { args = a; return this }, async all() { return { results: rows } }, async first() { return /FROM notice_posts WHERE id=\?/.test(sql) ? rows.find(r => r.id === Number(args[0]) && r.status === 'published') || null : null }, async run() { return { meta: {} } } } } },
  BOARD_FILES: { async get() { return null } },
};
const get = url => worker.fetch(new Request(url, { redirect: 'manual' }), env, { waitUntil() {} });
const meta = (html, attr, name) => (html.match(new RegExp(attr + '="' + name + '" content="([^"]*)"')) || [])[1] || null;

test('notice detail page renders photos server-side with link-preview image', async () => {
  const r = await get('https://seonammedi.kr/board/notices/22');
  assert.equal(r.status, 200);
  const html = await r.text();
  assert.match(html, /<img src="\/board\/api\/files\/seonammedi%2Fnotices%2F22%2Fphoto\.jpg" alt="공지 첨부사진">/);
  assert.equal(meta(html, 'property', 'og:image'), 'https://seonammedi.kr/board/api/files/seonammedi%2Fnotices%2F22%2Fphoto.jpg');
  assert.equal(meta(html, 'name', 'twitter:card'), 'summary_large_image');
  assert.equal(meta(html, 'property', 'og:title'), 'Test &lt;공지&gt;', 'titles are escaped in meta');
  assert.ok(!html.includes('<공지>'), 'raw title must not be injected');
});

test('detail page keeps the /seonammedi mount on ekodi.kr and canonical previews on seonammedi.kr', async () => {
  const html = await (await get('https://ekodi.kr/seonammedi/board/notices/22')).text();
  assert.match(html, /src="\/seonammedi\/board\/api\/files\//);
  assert.equal(meta(html, 'property', 'og:url'), 'https://seonammedi.kr/board/notices/22');
});

test('legacy ?id= share links get the same preview; photo-less notices fall back to a summary card', async () => {
  const shared = await (await get('https://seonammedi.kr/board/notices?id=22')).text();
  assert.equal(meta(shared, 'property', 'og:image'), 'https://seonammedi.kr/board/api/files/seonammedi%2Fnotices%2F22%2Fphoto.jpg');
  const plain = await (await get('https://seonammedi.kr/board/notices/19')).text();
  assert.equal(meta(plain, 'property', 'og:image'), null);
  assert.equal(meta(plain, 'name', 'twitter:card'), 'summary');
  const list = await (await get('https://seonammedi.kr/board/notices')).text();
  assert.equal(meta(list, 'property', 'og:image'), null, 'plain list page is unchanged');
});

test('missing or deleted notices redirect to the list instead of exposing content', async () => {
  for (const id of [999, 20]) {
    const r = await get('https://seonammedi.kr/board/notices/' + id);
    assert.equal(r.status, 302);
    assert.equal(r.headers.get('location'), '/board/notices');
  }
});

test('collapsed list keeps the existing thumbnail contract and share links', async () => {
  const source = await read('services/independent-board/worker.js');
  assert.match(source, /class="row-photo"><img src=/);
  assert.match(source, /function sharedUrl\(id\)\{const u=new URL\(location\.href\);u\.hash="";u\.searchParams\.set\("id",id\)/);
  assert.match(source, /function noticesPage\(req\)\{/);
});

test('home feed shows notice thumbnails and keeps board notice links', async () => {
  const [feed, css, html] = await Promise.all([read('sites/seonammedi/public/home-public-feed.js'), read('sites/seonammedi/public/home-public-feed.css'), read('sites/seonammedi/public/index.html')]);
  assert.match(feed, /url:home\+'\/board\/notices\?id='\+encodeURIComponent\(x\.id\),thumb:firstPhoto\(x,home\)/);
  assert.match(feed, /class="public-feed-thumb"/);
  assert.match(css, /\.public-feed-thumb\{/);
  assert.match(html, /home-public-feed\.js\?v=20261020-board-only-1/);
  // firstPhoto: board URLs get the mount, Site Core paths do not, non-paths are ignored.
  const firstPhoto = new Function('return ' + feed.match(/const firstPhoto=(\(x,mount\)=>\{[^\n]*\});/)[1])();
  assert.equal(firstPhoto({ imageUrls: ['/board/api/files/a.jpg'] }, '/seonammedi'), '/seonammedi/board/api/files/a.jpg');
  assert.equal(firstPhoto({ imageUrl: '/api/seonammedi/notices/3/image' }, '/seonammedi'), '/api/seonammedi/notices/3/image');
  assert.equal(firstPhoto({ imageUrls: ['javascript:alert(1)'] }, ''), '');
});

test('Site Core notice page adds og:image and hands off unknown ids to the board detail', async () => {
  const src = await read('public-discovery-content.js');
  assert.match(src, /property="og:image" content="https:\/\/seonammedi\.kr\/api\/seonammedi\/notices\/\$\{Number\(row\.id\)\}\/image\/0"/);
  assert.match(src, /location:`\/seonammedi\/board\/notices\/\$\{Number\(match\[1\]\)\}`/);
});
