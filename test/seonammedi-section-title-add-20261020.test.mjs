import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// 2026-10-20 owner requests: retitle the two central sections, remove their notes, and after 관리자 로그인 show a
// "＋ 추가" button at the right end that opens the add form for that section.
const pub=p=>readFile(new URL('../sites/seonammedi/public/'+p,import.meta.url),'utf8');
const [html,app,css]=await Promise.all([pub('index.html'),pub('app.js'),pub('app.css')]);

test('titles are renamed and the notes under them are gone',()=>{
  assert.match(html,/<h2>서남권 국립의대 비상대책위원회 활동이력<\/h2><\/div><div class="section-head-actions">/);
  assert.match(html,/<h2>서남권 국립의대 관련소식<\/h2><\/div><div class="section-head-actions" id="timelineHeadActions">/);
  assert.doesNotMatch(html,/직접 주관·참여한 활동을 먼저 보여줍니다/);
  assert.doesNotMatch(html,/발행일 최신순으로 보여주며, 검증된 과거 기록까지/);
});

test('login and ＋ 추가 sit at the title right end and open the add forms',()=>{
  assert.match(html,/data-admin-login="committee-activity">관리자 로그인<\/button><button id="committeeActivityManageToggle"[^>]*section-add-button[^>]*hidden[^>]*>＋ 추가<\/button>/);
  assert.match(html,/data-admin-login="timeline"[^>]*>관리자 로그인<\/button><button id="timelineManageToggle"[^>]*section-add-button[^>]*hidden[^>]*>＋ 추가<\/button>/);
  assert.match(app,/toggle\.textContent=open\?'닫기':'＋ 추가'/);
  assert.match(app,/toggle\.textContent='＋ 추가';return\}/);
  assert.match(css,/\.section-view-title\.section-title-actions \.section-head-actions\{flex:0 0 auto;justify-content:flex-end\}/);
});

test('category panel shows the full titles while logic keeps the menu name',async()=>{
  const rt=await readFile(new URL('../sites/seonammedi/public/central-category-runtime.js',import.meta.url),'utf8');
  assert.match(rt,/const TOPIC_TITLES=\{'활동이력':'서남권 국립의대 비상대책위원회 활동이력','관련소식':'서남권 국립의대 관련소식'\}/);
  assert.match(rt,/currentTopic=name;title\.textContent=TOPIC_TITLES\[name\]\|\|name;/);
  assert.doesNotMatch(rt,/title\.textContent===name|title\.textContent==='소통채널'/);
});
