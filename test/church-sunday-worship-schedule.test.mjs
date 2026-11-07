import test from 'node:test';
import assert from 'node:assert/strict';
import { churchSundayWorshipEvents, CHURCH_SUNDAY_WORSHIP } from '../site-board-control.js';

test('every Sunday 11:00 worship at EKODI Church is a recurring public key date', () => {
  const events = churchSundayWorshipEvents('2026-11-10');
  assert.deepEqual(events.map(e => e.date), ['2026-11-15', '2026-11-22', '2026-11-29', '2026-12-06']);
  for (const e of events) {
    assert.equal(e.time, '11:00'); assert.equal(e.title, '주일예배'); assert.equal(e.venue, '에코디교회');
    assert.equal(e.source, 'ekodichurch'); assert.equal(e.kind, 'recurring-worship'); assert.equal(e.url, '/ekodichurch/#worship');
  }
});

test('2026-11-08 Sunday worship is held at Mokpo Peace Plaza; today counts when it is Sunday', () => {
  const events = churchSundayWorshipEvents('2026-11-08');
  assert.equal(events[0].date, '2026-11-08');
  assert.equal(events[0].venue, '목포 평화광장');
  assert.equal(events[1].venue, '에코디교회');
  assert.equal(churchSundayWorshipEvents('2026-11-07')[0].venue, '목포 평화광장');
  assert.equal(CHURCH_SUNDAY_WORSHIP.venueOverrides['2026-11-08'], '목포 평화광장');
  assert.deepEqual(churchSundayWorshipEvents('bad'), []);
});
