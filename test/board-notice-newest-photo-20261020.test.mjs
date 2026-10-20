import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// 2026-10-20: board notices listed old pinned posts above new ones (pinned DESC, updated_at DESC)
// and a saved photo was invisible in the collapsed list, so uploads looked like they failed.
const worker=await readFile(new URL('../services/independent-board/worker.js',import.meta.url),'utf8');
const {default:board}=await import('../services/independent-board/worker.js');

function fakeDb(rows){let sql='';return{get sql(){return sql},prepare(q){sql=q;const o={bind(){return o},async all(){return{results:rows}},async first(){return null},async run(){return{meta:{}}}};return o}}}

test('public and admin notice lists are newest-first by creation time',async()=>{
  const db=fakeDb([]);
  await board.fetch(new Request('https://ekodi.kr/seonammedi/board/api/notices'),{ENVIRONMENT:'production',BOARD_DB:db},{});
  assert.match(db.sql,/ORDER BY created_at DESC,id DESC/);
  assert.doesNotMatch(worker,/ORDER BY pinned DESC,updated_at DESC/);
});

test('client re-sorts newest first and shows KST creation date',()=>{
  assert.match(worker,/sort\(\(a,b\)=>noticeTime\(b\)-noticeTime\(a\)/);
  assert.match(worker,/timeZone:"Asia\/Seoul"/);
  assert.doesNotMatch(worker,/esc\(\(x\.updatedAt\|\|""\)\.slice\(0,10\)\)/);
});

test('collapsed notice row exposes attached photos with a mount-aware thumbnail',()=>{
  assert.match(worker,/class="row-photo"><img src="\\'\+esc\(noticeImageUrl\(x\.imageUrls\[0\]\)\)/);
  assert.match(worker,/body\.board-notices \.row-head \.row-photo img\{width:44px/);
});
