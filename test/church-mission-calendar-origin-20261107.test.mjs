import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');

test('Mission public calendar displays Church and Mission separately with keyboard labels',async()=>{
  const [page,js,css]=await Promise.all([
    read('space/ekodimission.page'),read('space/ekodimission-saturday.js'),read('space/ekodimission.css')
  ]);
  assert.ok(page.includes('data-mission-calendar-origin="ekodichurch">교회 일정'));
  assert.ok(page.includes('data-mission-calendar-origin="ekodimission">선교회 일정'));
  assert.ok(js.includes("item.source==='ekodichurch'?'교회 일정':'선교회 일정'"));
  assert.ok(js.includes("source:item.source"));
  assert.ok(js.includes("count.church")&&js.includes("count.mission"));
  assert.ok(js.includes("교회 '+count.church+'건, 선교회 '+count.mission+'건"));
  assert.ok(js.includes("item.source==='ekodimission'?owned.get(item.id)||null:null"));
  assert.ok(js.includes("document.addEventListener('visibilitychange'"));
  assert.ok(js.includes("window.addEventListener('focus'"));
  assert.ok(js.includes("sharedScheduleTimer=setInterval"));
  assert.ok(js.includes("clearInterval(sharedScheduleTimer)"));
  assert.ok(css.includes('mission-schedule-source-ekodichurch'));
  assert.ok(css.includes('mission-schedule-source-ekodimission'));
});

test('Public schedule read endpoint has canonical readonly federation and does not expose body or identity',async()=>{
  const js=await read('site-board-control.js');
  const start=js.indexOf('export function parseEkodiPublicSchedule(');
  const end=js.indexOf('async function readSharedPublicSchedules',start);
  assert.ok(start>0&&end>start);
  const code=js.slice(start,end);
  assert.ok(code.includes("const value=JSON.parse(raw)"));
  assert.ok(code.includes("raw.replace(/\\r/g,'').split('\\n')"));
  assert.ok(code.includes("value.venue.trim()"));
  assert.ok(code.includes("date<today"));
  assert.ok(code.includes("return {id,source,sourceLabel"));
  const publicProjection=code.slice(code.lastIndexOf('return {id,source,sourceLabel'));
  assert.ok(publicProjection.includes('date,time,venue,title,url:'));
  assert.ok(!publicProjection.includes('description:'));
  assert.ok(!code.includes('body:raw'));
  assert.ok(js.includes("p.status='published'"));
  assert.ok(js.includes("sub==='/api/shared-schedules'"));
  assert.ok(js.includes("method!=='GET'"));
});
