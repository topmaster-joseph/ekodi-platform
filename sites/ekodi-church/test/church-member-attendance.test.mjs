import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('member attendance exposes self-only analytics',async()=>{
  const [html,app]=await Promise.all([read('my/attendance/index.html'),read('my/attendance/app.js')]);
  assert.match(html,/data-ekodi-church-attendance="v2"/);
  assert.match(html,/현재 연속출석/);
  assert.match(html,/최장 연속출석/);
  assert.match(html,/월별 출결 흐름/);
  assert.match(html,/본인 조회/);
  for(const id of ['currentStreak','longestStreak','lastAttended','lastAbsent','monthlyTrend']){
    assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,`${id} must appear exactly once`);
  }
  assert.equal((html.match(/<section class="streak-grid"/g)||[]).length,1,'streak grid must appear exactly once');
  assert.equal((html.match(/MONTHLY TREND/g)||[]).length,1,'monthly trend panel must appear exactly once');
  assert.match(app,/functions\/v1\/church-member-attendance-api/);
  assert.match(app,/current_streak/);
  assert.match(app,/longest_streak/);
  assert.match(app,/last_attended_date/);
  assert.match(app,/last_absence_date/);
  assert.match(app,/Array\.isArray\(data\.monthly\)/);
  assert.doesNotMatch(app,/church_attendance_list|church_members|church_staff|service_role/);
});

test('attendance analytics preserve recorded-only wording and responsive layout',async()=>{
  const [html,app,css]=await Promise.all([read('my/attendance/index.html'),read('my/attendance/app.js'),read('my/attendance/styles.css')]);
  assert.match(html,/기록되지 않은 예배는 자동으로 결석 처리하지 않습니다/);
  assert.match(app,/미기록 예배는 결석으로 계산하지 않습니다/);
  assert.match(css,/\.streak-grid/);
  assert.match(css,/\.month-row/);
  assert.match(css,/@media\(max-width:560px\)/);
  assert.match(app,/<progress class="month-meter"/);
  assert.doesNotMatch(app,/style="width:/);
});
