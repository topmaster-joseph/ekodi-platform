import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('AI Context Hub stores canonical context, events and per-agent cursors additively', async () => {
  const migration = await read('supabase/migrations/20260816093000_ai_context_hub.sql');
  for (const table of ['ai_shared_context','ai_collaboration_events','ai_agent_cursors']) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}`));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(migration, new RegExp(`revoke all on public\\.${table} from anon, authenticated`));
  }
  assert.match(migration, /visibility.*ecosystem.*restricted.*agent/s);
  assert.match(migration, /sensitivity.*public.*internal.*confidential.*restricted/s);
  assert.doesNotMatch(migration, /drop\s+table|truncate\s+|delete\s+from/i);
});

test('Admin Context Hub revalidates EKODI admin sessions and never exposes service-role to browser clients', async () => {
  const source = await read('supabase/functions/ai-context-hub/index.ts');
  assert.match(source, /\/api\/session/);
  assert.match(source, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(source, /x-ekodi-ai-token/);
  assert.match(source, /readableBy/);
  assert.doesNotMatch(source, /return\s+json\([^\n]*SERVICE_ROLE/i);
});

test('Specialist AI bridge is server-only and identifies every writer by agent name', async () => {
  const source = await read('supabase/functions/ai-context-agent/index.ts');
  assert.match(source, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(source, /x-ekodi-ai-agent/);
  assert.match(source, /constantTimeEqual\(bearer, SERVICE_ROLE\)/);
  assert.match(source, /ai_agent_cursors/);
  assert.match(source, /target_agents/);
  assert.doesNotMatch(source, /Access-Control-Allow-Origin/i);
});

test('AI REPORT results automatically enter the shared collaboration stream', async () => {
  const bridge = await read('supabase/migrations/20260816094000_ai_context_report_bridge.sql');
  assert.match(bridge, /after insert on public\.ai_reports/);
  assert.match(bridge, /insert into public\.ai_shared_context/);
  assert.match(bridge, /insert into public\.ai_collaboration_events/);
  assert.match(bridge, /decision_required/);
  assert.doesNotMatch(bridge, /drop\s+table|truncate\s+|delete\s+from/i);
});
