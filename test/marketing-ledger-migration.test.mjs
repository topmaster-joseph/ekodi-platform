import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync(new URL('../migrations/0023_marketing_event_ledger.sql', import.meta.url), 'utf8');

test('Marketing ledger migration is additive and indexed', () => {
  for (const table of ['marketing_workspace_templates','marketing_campaigns','marketing_events']) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS idx_marketing_events_source_ref/);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS idx_marketing_events_workspace_time/);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS idx_marketing_events_customer_time/);
  assert.doesNotMatch(sql, /DROP TABLE|DROP COLUMN|ALTER TABLE .* RENAME/i);
});

test('Marketing ledger migration seeds templates, not operational activity', () => {
  assert.match(sql, /INSERT OR IGNORE INTO marketing_workspace_templates/);
  assert.doesNotMatch(sql, /INSERT(?: OR IGNORE)? INTO marketing_events/i);
  assert.doesNotMatch(sql, /INSERT(?: OR IGNORE)? INTO marketing_campaigns/i);
});
