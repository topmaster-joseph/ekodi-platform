import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import board from '../services/independent-board/worker.js';

const roots=['https://seonammedi.kr', 'https://ekodi.kr/seonammedi',
  'https://xn--3e0b8b58jw4co4mnpll3k.kr'];
const pages=[
  {path:'/board/notices',description:'공식 공지',title:'공지'},
  {path:'/board/voices',description:'시민의견',title:'시민의견'}
];

test('Public board list pages on all mounts resolve to their one independent-domain canonical',async()=>{
  for(const root of roots)for(const page of pages){
    const result=await board.fetch(new Request(root+page.path),{});
    assert.equal(result.status,200,root+page.path);
    assert.match(result.headers.get('content-type')||'',/text\/html/);
    const html=await result.text();
    const canonical='https://xn--3e0b8b58jw4co4mnpll3k.kr'+page.path;
    assert.ok(html.includes('<link rel="canonical" href="'+canonical+'">'),root+page.path);
    assert.equal((html.match(/<link rel="canonical"/g)||[]).length,1,root+page.path);
    assert.ok(html.includes('<meta name="description" content="'),root+page.path);
    assert.ok(html.includes(page.description),root+page.path);
    assert.ok(html.includes('<meta property="og:url" content="'+canonical+'">'),root+page.path);
    assert.ok(html.includes('<meta property="og:description" content="'),root+page.path);
  }
});

test('Private/other board surfaces never inherit public list discovery meta',()=>{
  const src=readFileSync(new URL('../services/independent-board/worker.js',import.meta.url),'utf8');
  assert.match(src,/!headExtra&&\(active==='voices'\|\|active==='notices'\)/);
  assert.match(src,/noticePreviewMeta\(row,SEONAM_PUBLIC_ORIGIN/);
  assert.match(src,/const discoveryMeta=/);
});
