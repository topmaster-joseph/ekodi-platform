import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('WORK admin browser code is syntactically valid and never embeds a service role key', async () => {
  execFileSync(process.execPath, ['--check', 'work-admin.js'], { stdio: 'pipe' });
  const source = await read('work-admin.js');
  assert.match(source, /functions\/v1\/work-admin-api/);
  assert.match(source, /ekodi-auth-token/);
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY|service_role/i);
});

test('WORK admin edge function revalidates EKODI admin sessions and limits admin hiring powers', async () => {
  const source = await read('supabase/functions/work-admin-api/index.ts');
  const parseable = source.replace(/^import .*;$/gm, '');
  assert.doesNotThrow(() => new Function(parseable));
  assert.match(source, /api\.ekodi\.kr\/api\/session/);
  assert.match(source, /admin_can_only_unpublish_or_close/);
  assert.match(source, /\["draft", "closed"\]/);
  assert.doesNotMatch(source, /req\.method === "PATCH"[^\n]+applications/i);
  assert.match(source, /work_admin_audit/);
});

test('WORK admin audit table is private and existing Work tables are untouched', async () => {
  const migration = await read('supabase/migrations/20260815080500_work_admin_audit.sql');
  assert.match(migration, /create table if not exists public\.work_admin_audit/i);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all on public\.work_admin_audit from anon, authenticated/i);
  assert.doesNotMatch(migration, /alter table public\.work_(profiles|organizations|jobs|applications)/i);
});

test('admin CSP allows only the Supabase origin needed by WORK live operations', async () => {
  const worker = await read('site-worker.js');
  assert.match(worker, /ADMIN_CSP[\s\S]+connect-src[^\n]+renzehysxirjilvdxacv\.supabase\.co/);
});
