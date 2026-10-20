import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// 2026-10-20 owner request: shorter committee title; footer gains the committee line and the site-maker credit
// (company · representative · contact) on every page that shares the footer.
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const CREDIT='<span class="site-footer-credit">사이트 제작 에코디비즈 · 대표 정찬균 · <a href="tel:01035018542">010-3501-8542</a> · <a href="mailto:ekodibiz@gmail.com">ekodibiz@gmail.com</a></span>';

test('every shared footer carries the committee line and the EKODIBIZ credit',async()=>{
  for(const p of ['sites/seonammedi/public/index.html','sites/seonammedi/public/finance/index.html','sites/seonammedi/public/notices/index.html','sites/seonammedi/public/minutes/index.html','services/independent-board/worker.js']){
    const s=await read(p);
    assert.ok(s.includes('<span>서남권 의대 설립 비상대책위원회 · 자료의 성격과 출처를 구분해 보존합니다.</span>'+CREDIT),p);
    assert.ok(!s.includes('<span>자료의 성격과 출처를 구분해 보존합니다.</span></div>'),p+' still has the old footer');
  }
  for(const p of ['sites/seonammedi/public/app.css','sites/seonammedi/public/shared-site-header.css'])
    assert.match(await read(p),/footer\.site-footer \.site-footer-copy \.site-footer-credit\{/,p);
});

test('committee section title is "비상대책위원회 활동이력" in the page and the category panel',async()=>{
  assert.match(await read('sites/seonammedi/public/index.html'),/<h2>비상대책위원회 활동이력<\/h2>/);
  assert.match(await read('sites/seonammedi/public/central-category-runtime.js'),/'활동이력':'비상대책위원회 활동이력'/);
});
