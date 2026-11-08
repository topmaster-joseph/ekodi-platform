import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('admin church.events rows become public church schedule items', async () => {
  const { churchAdminEventItems } = await import('../site-board-control.js');
  const items = churchAdminEventItems([
    { event_date: '2026-11-15', event_time: '12:30:00', title: '공동의회 (주일예배 후)', location: '에코디교회', category: 'meeting' },
    { event_date: '2026-11-20', event_time: null, title: '성경공부', location: null, category: 'ministry' },
    { event_date: 'bad', title: 'x' },
    { event_date: '2026-11-21', title: '' },
  ]);
  assert.equal(items.length, 2);
  assert.deepEqual(
    { date: items[0].date, time: items[0].time, venue: items[0].venue, kind: items[0].kind, source: items[0].source },
    { date: '2026-11-15', time: '12:30', venue: '에코디교회', kind: 'church-admin-event', source: 'ekodichurch' },
  );
  assert.equal(items[1].time, '00:00');
  assert.equal(items[1].venue, '에코디교회');
  assert.deepEqual(churchAdminEventItems(null), []);
});

test('public events RPC exposes only scheduled, non-care, upcoming public fields', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20261108110000_church_public_events.sql', import.meta.url), 'utf8');
  assert.match(sql, /e\.status = 'scheduled'/);
  assert.match(sql, /e\.category <> 'care'/);
  assert.match(sql, /Asia\/Seoul/);
  assert.match(sql, /grant execute on function public\.church_public_events\(text, integer\) to anon/);
  assert.doesNotMatch(sql, /created_by|tenant_id\s*,/);
});
