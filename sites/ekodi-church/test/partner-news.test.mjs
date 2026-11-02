import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('public church partner news is read-only and published-only', async () => {
  const [html,js,headers,css]=await Promise.all([
    read('index.html'),read('partner-news.js'),read('_headers'),read('partner-news.css')
  ]);
  assert.ok(html.includes('id="partner-news"'));
  assert.ok(html.includes('id="partner-news-feed"'));
  assert.ok(html.includes('partner-news.js'));
  assert.ok(html.includes('partner-news.css'));
  assert.ok(js.includes('/api/partner-news/public?tenant=ekodi-church&service=church'));
  assert.ok(js.includes("item.status==='PUBLISHED'"));
  assert.ok(!js.includes('/api/church/admin/partner-news'));
  assert.ok(headers.includes("connect-src 'self' https://api.ekodi.kr"));
  assert.ok(css.includes('.partner-news-feed'));
});
