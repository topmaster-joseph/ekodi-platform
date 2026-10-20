import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

// 2026-10-20 (owner approved): /seonammedi/notices/<id> is the 주요일정(행사·일정) detail. It showed events under a
// "공지" label with a write button and no event time, and relative header links broke at that deep path
// (e.g. /seonammedi/notices/board/voices → 404). Below the event it now lists the board's notices.
const pub=p=>readFile(new URL('../sites/seonammedi/public/'+p,import.meta.url),'utf8');
const [app,html,css,cal]=await Promise.all([pub('app.js'),pub('index.html'),pub('app.css'),pub('calendar-sidebar.js')]);

function helpers(){
  const start=app.indexOf('const EVENT_WEEKDAYS='),end=app.indexOf('function noticeCard(item){');
  const ctx={Date};vm.runInNewContext(app.slice(start,end)+';globalThis.eventWhen=eventWhen;',ctx);return ctx;
}

test('event time is shown in KST wall-clock form, without a fake range',()=>{
  const {eventWhen}=helpers();
  assert.equal(eventWhen({eventStart:'2026-10-22T09:00',eventEnd:'2026-10-22T20:00'}),'2026. 10. 22.(목) 09:00 ~ 20:00');
  assert.equal(eventWhen({eventStart:'2026-10-20T09:00',eventEnd:'2026-10-20T09:00'}),'2026. 10. 20.(화) 09:00');
  assert.equal(eventWhen({eventStart:'2026-10-22T09:00',eventEnd:'2026-10-23T18:00'}),'2026. 10. 22.(목) 09:00 ~ 10. 23.(금) 18:00');
  assert.match(app,/<p class="event-when"><strong>일시<\/strong>/);
});

test('view is labelled 행사·일정, write button retired, board linked',()=>{
  assert.match(html,/<p class="eyebrow">EVENTS<\/p><h2>행사·일정<\/h2>/);
  assert.match(html,/<a class="module-primary notice-board-link" href="board\/notices">공지 게시판<\/a>/);
  assert.match(html,/id="noticeWriteButton"[^>]*hidden data-retired="events-view"/);
  assert.match(css,/#notices #noticeWriteButton\[data-retired\]\{display:none!important\}/);
});

test('below the event, the board notice list follows the board rules',()=>{
  assert.match(app,/fetch\(mount\+'\/board\/api\/notices'/);
  assert.match(app,/Number\(Boolean\(b\.pinned\)\)-Number\(Boolean\(a\.pinned\)\)\|\|boardNoticeTime\(b\)-boardNoticeTime\(a\)/);
  assert.match(app,/regular\.length-i/);
  assert.match(app,/mount\+'\/board\/notices\/'\+encodeURIComponent\(x\.id\)/);
  assert.match(css,/#notices \.board-notice-row strong\{flex:1 1 0;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis/);
  assert.match(css,/#notices \.board-notice-row \.board-row-photo img\{display:block!important/);
  assert.match(css,/#notices \.module-main\{grid-template-columns:minmax\(0,1fr\)\}/);
});

test('relative links and assets resolve against the site mount, not the deep path',()=>{
  assert.match(app,/function mountRelativeLinks\(root=document\)/);
  assert.match(app,/\nmountRelativeLinks\(\);\n/);
  assert.match(html,/<link rel="stylesheet" href="\/seonammedi\/central-category-menu\.css">/);
  assert.match(html,/<script src="\/seonammedi\/central-category-runtime\.js\?v=/);
  assert.doesNotMatch(html,/(?:src|href)="\.\/central-category/);
  assert.match(app,/a\[href\$="board\/finance"\]/);
});

test('calendar never prints a start == end range',()=>{
  assert.match(cal,/item\.eventEnd&&item\.eventEnd!==item\.eventStart\?displayTime\(item\.eventEnd\)/);
  assert.match(cal,/\(item\.eventEnd&&item\.eventEnd!==item\.eventStart\?' ~ '/);
});
