import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import board from '../services/independent-board/worker.js';

// Owner request (2026-10-19): every SeonamMedi page keeps the same header and
// footer, and the view title must not repeat the top-menu label already shown.

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const LABELS=['공지','활동이력','관련소식','소통채널','시민의견','조직'];
const FOOTER_COPY='<div class="site-footer-copy"><strong>서남권 국립의대 소통센터</strong><span>자료의 성격과 출처를 구분해 보존합니다.</span></div>';
const VERSION='shared-site-header.css?v=20261019-unified-shell-1';

function navLabels(html){
  const nav=html.match(/<nav class="ekodi-six-nav"[^>]*>([\s\S]*?)<\/nav>/)?.[1]||'';
  return [...nav.matchAll(/<a\b[^>]*>([^<]+)<\/a>/g)].map(m=>m[1].trim());
}
function checkShell(name,html){
  assert.match(html,/<header class="site-header[^"]*">/,name+': shared header');
  assert.match(html,/<a class="brand"[^>]*><strong>서남권 국립의대 소통센터<\/strong><small>서남권 의대 설립 비상대책위원회 관련 공개 기록·소통 채널<\/small><\/a>/,name+': same brand');
  assert.deepEqual(navLabels(html),LABELS,name+': same six menus in order');
  assert.equal(html.split('<footer class="site-footer">').length-1,1,name+': exactly one site footer');
  assert.ok(html.includes(FOOTER_COPY),name+': same footer copy');
  assert.ok(html.includes(VERSION),name+': same shared stylesheet version');
}

test('static SeonamMedi pages share one header, one footer and one stylesheet version',async()=>{
  for(const path of ['index.html','notices/index.html','finance/index.html','minutes/index.html'])
    checkShell(path,await read('sites/seonammedi/public/'+path));
  const notices=await read('sites/seonammedi/public/notices/index.html');
  assert.ok(!notices.includes('href="/admin/"'),'static notices footer must not point at the EKODI-wide /admin/');
});

test('independent board pages render the same shell on both mounts',async()=>{
  for(const base of ['https://seonammedi.kr','https://ekodi.kr/seonammedi'])
    for(const route of ['voices','notices']){
      const res=await board.fetch(new Request(base+'/board/'+route),{});
      assert.equal(res.status,200);
      checkShell(base+'/board/'+route,await res.text());
    }
});

test('repeated menu titles are screen-reader only; notes and admin actions stay visible',async()=>{
  const css=await read('sites/seonammedi/public/shared-site-header.css');
  assert.match(css,/\[data-view-section\]>\.section-head \.eyebrow,\[data-view-section\]>\.section-head h2,\s*\.board-head \.eyebrow,\.board-head h1\{position:absolute!important;width:1px!important;height:1px!important/);
  assert.doesNotMatch(css,/\.section-head \.note\{[^}]*display:none|\.board-actions\{[^}]*display:none/);
  assert.match(css,/footer\.site-footer\{/);
});
