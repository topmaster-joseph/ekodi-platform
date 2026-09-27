import test from 'node:test';
import assert from 'node:assert/strict';
import { __test, SITE_IMPROVEMENT_POLICY } from '../ekodi-site-improvement-scheduler.js';

const windowAt=iso=>__test.siteImprovementWindow(new Date(iso));

test('09:00 KST starts a new morning server-load cycle at 30 percent',()=>{
  assert.deepEqual(windowAt('2026-09-27T00:00:00.000Z'),{
    budgetDay:'2026-09-27',slot:'morning',cycleKey:'2026-09-27:morning',
    serverLoadCapPercent:30,emergencyReservePercent:10,resetHourKst:9,
  });
});

test('lunch raises the live server-load ceiling to 60 percent',()=>{
  const value=windowAt('2026-09-27T03:00:00.000Z');
  assert.equal(value.budgetDay,'2026-09-27');
  assert.equal(value.slot,'lunch');
  assert.equal(value.serverLoadCapPercent,60);
});

test('evening remains on the same budget day through 08:59 KST next day',()=>{
  const value=windowAt('2026-09-27T23:59:00.000Z');
  assert.equal(value.budgetDay,'2026-09-27');
  assert.equal(value.slot,'evening');
  assert.equal(value.cycleKey,'2026-09-27:evening');
  assert.equal(value.serverLoadCapPercent,90);
  assert.equal(value.emergencyReservePercent,10);
});

test('next 09:00 KST resets the cycle and never exposes the reserved 10 percent',()=>{
  const value=windowAt('2026-09-28T00:00:00.000Z');
  assert.equal(value.budgetDay,'2026-09-28');
  assert.equal(value.slot,'morning');
  assert.equal(value.serverLoadCapPercent,30);
  assert.equal(SITE_IMPROVEMENT_POLICY.dailyLimit,3);
  assert.equal(SITE_IMPROVEMENT_POLICY.emergencyReservePercent,10);
});
