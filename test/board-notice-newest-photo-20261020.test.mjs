import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// 2026-10-20: board notices listed old pinned posts above new ones (pinned DESC, updated_at DESC)
// and a saved photo was invisible in the collapsed list, so uploads looked like they failed.
const worker=await readFile(new URL('../services/independent-board/worker.js',import.meta.url),'utf8');
const {default:board}=await import('../services/independent-board/worker.js');

function fakeDb(rows){let sql='';return{get sql(){return sql},prepare(q){sql=q;const o={bind(){return o},async all(){return{results:rows}},async first(){return null},async run(){return{meta:{}}}};return o}}}

test('public and admin notice lists keep pinned first, then newest by creation time',async()=>{
  const db=fakeDb([]);
  await board.fetch(new Request('https://ekodi.kr/seonammedi/board/api/notices'),{ENVIRONMENT:'production',BOARD_DB:db},{});
  assert.match(db.sql,/ORDER BY pinned DESC,created_at DESC,id DESC/);
  assert.doesNotMatch(worker,/updated_at DESC/);
});

test('client keeps pinned first, then newest, and shows KST creation date',()=>{
  assert.match(worker,/sort\(\(a,b\)=>Number\(Boolean\(b\.pinned\)\)-Number\(Boolean\(a\.pinned\)\)\|\|noticeTime\(b\)-noticeTime\(a\)/);
  assert.match(worker,/timeZone:"Asia\/Seoul"/);
  assert.doesNotMatch(worker,/esc\(\(x\.updatedAt\|\|""\)\.slice\(0,10\)\)/);
});

test('collapsed notice row exposes attached photos with a mount-aware thumbnail',()=>{
  assert.match(worker,/class="row-photo"><img src="\\'\+esc\(noticeImageUrl\(x\.imageUrls\[0\]\)\)/);
  assert.match(worker,/body\.board-notices \.row-head \.row-photo img\{width:44px/);
});

test('notice rows carry a left-hand number: pinned show 중요, others count down with oldest = 1',()=>{
  assert.match(worker,/const rowNo=new Map\(items\.filter\(x=>!x\.pinned\)\.slice\(\)\.reverse\(\)\.map\(\(x,i\)=>\[x\.id,i\+1\]\)\)/);
  assert.match(worker,/<span class="row-no is-pinned" aria-label="중요 공지">중요<\/span>/);
  assert.match(worker,/<span class="row-no" aria-label="글번호">\\'\+rowNo\.get\(x\.id\)/);
  assert.match(worker,/body\.board-notices \.row-head>strong\{flex:1 1 auto\}/);
});
