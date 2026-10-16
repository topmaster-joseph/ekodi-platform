import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../services/independent-board/worker.js',import.meta.url),'utf8');

test('notice-only responsive page width and image-original links',()=>{
  for(const expected of [
    'body.board-notices main',
    'body.board-notices .notice-image-link',
    'object-fit:contain!important',
    'aria-label="공지 첨부 이미지 원본 보기"',
    'rel="noopener noreferrer"',
    'noticeImageUrl).filter(Boolean)'
  ])assert.ok(source.includes(expected),expected);
});

test('notice search and Google-login compose return preserve server authorization',()=>{
  for(const expected of [
    'id="noticeSearch"',
    'visible=q?items.filter',
    'target.searchParams.set("compose","1")',
    'if(!admin){noticeLogin();return}',
    '/board/api/admin/notices',
    'id="adminLogin" class="secondary" hidden'
  ])assert.ok(source.includes(expected),expected);
});

test('both standalone and EKODI subpath notice mounts retain six menu navigation',async()=>{
  const mod=await import(new URL('../services/independent-board/worker.js?notice-ux='+Date.now(),import.meta.url));
  for(const url of [
    'https://seonammedi.kr/board/notices',
    'https://ekodi.kr/seonammedi/board/notices'
  ]){
    const res=await mod.default.fetch(new Request(url),{});
    assert.equal(res.status,200,url);
    const html=await res.text();
    assert.ok(html.includes('class="board-notices"'),url);
    assert.ok(html.includes('공지 검색'),url);
    assert.equal((html.match(/data-category-menu="소통채널"/g)||[]).length,1,url);
    assert.ok(html.includes('aria-controls="central-category-panel"'),url);
    assert.ok(html.includes('noticeLogin()'),url);
    assert.ok(html.includes('공지 작성'),url);
    assert.ok(html.includes('noticeImageUrl'),url);
    assert.equal((html.match(/class="site-header independent-board-header"/g)||[]).length,1,url);
  }
});

// Owner-authored CI retrigger following exact-SHA EKODI Orchestrator provenance recovery.
// No runtime, authorization, deployment, or production protection changes.

// Owner-authored CI recheck after protected main synchronization; test behavior unchanged.

test('public notices render a compact title/date list, with accessible expandable detail and permalink',async()=>{
  const mod=await import(new URL('../services/independent-board/worker.js?notice-list-only='+Date.now(),import.meta.url));
  for(const url of ['https://seonammedi.kr/board/notices','https://ekodi.kr/seonammedi/board/notices']){
    const response=await mod.default.fetch(new Request(url),{});
    assert.equal(response.status,200,url);
    const html=await response.text();
    assert.ok(html.includes('<details class="board-row notice-record"'),url);
    assert.ok(html.includes('<summary class="row-head"><strong>'),url);
    assert.ok(html.includes('</small></summary><p class="row-body">'),url);
    assert.ok(html.includes('</div></details>'),url);
    assert.ok(html.includes('if(el){el.open=true;el.classList.add'),url);
    assert.ok(html.includes('data-share='),url);
    assert.ok(html.includes('data-edit='),url);
    assert.ok(html.includes('data-delete='),url);
    assert.ok(html.includes('body.board-notices details.notice-record'),url);
    assert.ok(!html.includes('<article class="board-row" id="notice-'),url);
  }
});
