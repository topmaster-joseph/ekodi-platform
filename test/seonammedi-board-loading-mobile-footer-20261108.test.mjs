import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import board from '../services/independent-board/worker.js';

const page=async path=>(await board.fetch(new Request('https://seonammedi.kr'+path),{})).text();

test('citizen voices list shows a loading message before the list arrives', async()=>{
  const html=await page('/board/voices');
  assert.match(html,/<section id="freshList"[^>]*aria-busy="true"><p class="board-loading" role="status"[^>]*>.*시민의견 목록을 불러오는 중입니다/);
  assert.match(html,/if\(!listReady\)return;/,'search input cannot replace the loader with an empty state');
  assert.match(html,/다시 시도/,'load failure replaces the loader with a retry action');
  assert.match(html,/\.board-loading\{/);
  assert.match(html,/prefers-reduced-motion:reduce/);
});

test('notice list shows a loading message and never stays stuck on failure', async()=>{
  const html=await page('/board/notices');
  assert.match(html,/<section id="list" aria-busy="true"><p class="board-loading"[^>]*>.*목록을 불러오는 중입니다/);
  assert.match(html,/try\{await load\(\)\}catch\(e\)\{list\.innerHTML=/);
});

test('mobile footer keeps Korean words and contact links intact', async()=>{
  const css=await readFile(new URL('../sites/seonammedi/public/shared-site-header.css',import.meta.url),'utf8');
  assert.match(css,/SITE-FOOTER-MOBILE-002/);
  assert.match(css,/footer\.site-footer \.site-footer-copy span\{word-break:keep-all/);
  assert.match(css,/\.site-footer-credit a\{display:inline-block;overflow-wrap:normal;white-space:nowrap\}/);
  assert.match(css,/footer\.site-footer:has\(>a\[hidden\]\) \.site-footer-copy/);
});
