import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL('../supabase/migrations/20261003140500_activity_message_campaign_created_by_index.sql', import.meta.url),
  'utf8'
);

test('activity message campaign creator FK has a covering index', () => {
  assert.match(
    migration,
    /create\s+index\s+if\s+not\s+exists\s+activity_message_campaigns_created_by_idx[\s\S]*on\s+public\.activity_message_campaigns\s*\(\s*created_by\s*\)/i
  );
  assert.doesNotMatch(migration, /drop\s+(?:table|index)|truncate\s+table/i);
});
