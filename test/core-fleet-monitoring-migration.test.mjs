import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql = await readFile(new URL('../migrations/0037_activate_core_fleet_monitoring.sql', import.meta.url), 'utf8');

test('API and Biz are promoted into the monitored Core fleet', () => {
  assert.match(sql, /'api', 'active', 1/);
  assert.match(sql, /'biz', 'active', 1/);
  assert.match(sql, /WHERE service_id = 'api'[\s\S]*monitor_enabled = 0/);
  assert.match(sql, /WHERE service_id = 'biz'[\s\S]*state = 'planned'[\s\S]*monitor_enabled = 0/);
});

test('legacy promotion preserves explicit administrator overrides', () => {
  const guards = sql.match(/updated_by IS NULL/g) || [];
  const notes = sql.match(/COALESCE\(note, ''\) = ''/g) || [];
  assert.equal(guards.length, 2);
  assert.equal(notes.length, 2);
});
