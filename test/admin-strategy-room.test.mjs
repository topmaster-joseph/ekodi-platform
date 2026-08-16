import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Strategy Room is bundled behind the existing lazy admin asset', async () => {
  const build = await read('scripts/build.mjs');
  assert.match(build, /admin-workspace-strategy\.js/);
  assert.match(build, /admin-lazy-features\.js/);
  assert.match(build, /workspaceStrategyJs/);
});

test('Admin workspace provides persistent left navigation, strategy meeting and AI REPORT', async () => {
  const ui = await read('admin-workspace-strategy.js');
  assert.match(ui, /MANAGE/);
  assert.match(ui, /SITES/);
  assert.match(ui, /전략회의/);
  assert.match(ui, /AI REPORT/);
  assert.match(ui, /position:sticky/);
  assert.match(ui, /admin-strategy-api/);
  assert.doesNotMatch(ui, /OPENAI_API_KEY/);
  assert.doesNotMatch(ui, /service_role/i);
});

test('Strategy API revalidates EKODI admin session and keeps provider secret server-side', async () => {
  const api = await read('supabase/functions/admin-strategy-api/index.ts');
  assert.match(api, /\/api\/session/);
  assert.match(api, /OPENAI_API_KEY/);
  assert.match(api, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(api, /https:\/\/api\.openai\.com\/v1\/responses/);
  assert.match(api, /orchestrator/i);
  assert.match(api, /DECISION/);
  assert.doesNotMatch(api, /Deno\.serve[\s\S]*execute[_-]?action/i);
});

test('Strategy data is additive, RLS protected, and browser roles have no direct CRUD grants', async () => {
  const migration = await read('supabase/migrations/20260816090000_admin_strategy_room.sql');
  for (const table of ['admin_strategy_threads','admin_strategy_messages','ai_reports']) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}`));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(migration, new RegExp(`revoke all on public\\.${table} from anon, authenticated`));
  }
  assert.doesNotMatch(migration, /drop\s+table|truncate\s+|delete\s+from/i);
});
