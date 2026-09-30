import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { auditMigrationText, ENFORCEMENT_MIGRATION } from '../scripts/validate-supabase-public-grants.mjs';

test('new public tables require RLS and an explicit Data API access decision', () => {
  const issues = auditMigrationText(`
    create table public.demo_items(id bigint primary key);
  `, 'demo.sql');
  assert.ok(issues.some(issue => issue.includes('enable RLS')));
  assert.ok(issues.some(issue => issue.includes('explicit GRANT or REVOKE')));
});

test('authenticated table access is accepted when RLS and grants are explicit', () => {
  const issues = auditMigrationText(`
    create table public.demo_items(id bigint primary key);
    alter table public.demo_items enable row level security;
    grant select, insert on table public.demo_items to authenticated;
  `, 'demo.sql');
  assert.deepEqual(issues, []);
});

test('RPC-only public tables must explicitly revoke every Data API role', () => {
  const issues = auditMigrationText(`
    create table public.rpc_private(id bigint primary key);
    alter table public.rpc_private enable row level security;
    revoke all on table public.rpc_private from anon, authenticated, service_role;
  `, 'demo.sql');
  assert.deepEqual(issues, []);

  const incomplete = auditMigrationText(`
    create table public.rpc_private(id bigint primary key);
    alter table public.rpc_private enable row level security;
    revoke all on table public.rpc_private from anon, authenticated;
  `, 'demo.sql');
  assert.ok(incomplete.some(issue => issue.includes('service_role')));
});

test('public functions require explicit EXECUTE control', () => {
  const missing = auditMigrationText(`
    create or replace function public.demo_rpc() returns integer
    language sql as $$ select 1 $$;
  `, 'demo.sql');
  assert.ok(missing.some(issue => issue.includes('GRANT/REVOKE EXECUTE')));

  const explicit = auditMigrationText(`
    create or replace function public.demo_rpc() returns integer
    language sql as $$ select 1 $$;
    revoke all on function public.demo_rpc() from public, anon, authenticated, service_role;
    grant execute on function public.demo_rpc() to authenticated;
  `, 'demo.sql');
  assert.deepEqual(explicit, []);
});


test('cutover migration removes PostgreSQL global PUBLIC function execute default', () => {
  const sql = fs.readFileSync(new URL('../supabase/migrations/' + ENFORCEMENT_MIGRATION, import.meta.url), 'utf8');
  assert.match(sql, /alter\s+default\s+privileges\s+for\s+role\s+postgres\s+revoke\s+execute\s+on\s+functions\s+from\s+public\s*;/i);
  assert.doesNotMatch(sql, /alter\s+default\s+privileges\s+for\s+role\s+postgres\s+in\s+schema\s+public\s+revoke\s+execute\s+on\s+functions\s+from\s+public\s*;/i);
});
