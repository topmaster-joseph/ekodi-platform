#!/usr/bin/env node
// Executes every EKODI point migration and SQL smoke against a THROWAWAY
// PostgreSQL database (#6739). Each smoke runs inside BEGIN ... ROLLBACK and the
// script verifies that no rows remain afterwards.
//
//   POINTS_SMOKE_DATABASE_URL=postgres://postgres@localhost:5432/points_smoke \
//     node scripts/run-points-sql-smokes.mjs
//
// --existing-schema: the target is an ephemeral Supabase (CI) where all
// migrations are already applied; fixtures are loaded inside each rollback.
//
// Refuses Supabase hosts so it can never touch development or production data.
import {execFileSync} from 'node:child_process';
import {readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';

const url = process.env.POINTS_SMOKE_DATABASE_URL;
if (!url) { console.error('POINTS_SMOKE_DATABASE_URL is required (throwaway DB).'); process.exit(2); }
if (/supabase\.(co|com|net)|pooler\.supabase|renzehysxirjilvdxacv|lxcxwbdwwojjkgybbqii/i.test(url)) {
  console.error('REFUSED: points SQL smokes run only on a throwaway local database.'); process.exit(2);
}
const root = new URL('..', import.meta.url).pathname;
const psql = (args, input) => execFileSync('psql', [url, '-v', 'ON_ERROR_STOP=1', '-q', '-At', ...args],
  {input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']});

const existing = process.argv.includes('--existing-schema');
const already = psql(['-c', "select to_regclass('public.ekodi_point_ledger') is not null"]).trim();
const read = f => readFileSync(join(root, f), 'utf8');
let fixtures = '';
if (existing) {
  if (already !== 't') { console.error('point migrations are not applied on the target'); process.exit(2); }
  if (psql(['-c', 'select count(*) from public.ekodi_point_ledger']).trim() !== '0') {
    console.error('REFUSED: target holds point ledger rows; use an ephemeral database.'); process.exit(2);
  }
  // Real activity tables and authorization already exist here; the activity
  // stub smokes run in stub mode (a separate template0 database) instead.
  fixtures = read('test/fixtures/points-ci-supabase-fixtures.sql');
  console.log('using already-migrated ephemeral Supabase schema');
} else {
  if (already === 't') { console.error('REFUSED: target already contains point tables; use an empty DB.'); process.exit(2); }
  psql(['-f', join(root, 'test/fixtures/points-supabase-core-stub.sql')]);
  psql(['-f', join(root, 'test/fixtures/points-attendance-isolated-core.sql')]);
  const migrations = readdirSync(join(root, 'supabase/migrations'))
    .filter(f => /_ekodi_(site_activity_points|points)_.*\.sql$/.test(f)).sort();
  for (const f of migrations) psql(['-f', join(root, 'supabase/migrations', f)]);
  console.log(`applied ${migrations.length} point migrations`);
}
const countSql = 'select (select count(*) from public.ekodi_point_ledger)+(select count(*) from public.ekodi_point_wallets)+(select count(*) from public.ekodi_point_referral_rewards)+(select count(*) from public.people)+(select count(*) from auth.users)';
const before = psql(['-c', countSql]).trim();

const smokes = [
  ['points-behavioral-smoke.sql', null],
  ['points-attendance-isolated-smoke.sql', 'ATTENDANCE_ISOLATED_SMOKE_PASS', 'insert into public.tenants default values;', 'stub-only'],
  ['points-operator-isolated-smoke.sql', 'POINT_OPERATOR_ISOLATED_SMOKE_PASS', '', 'stub-only'],
  ['points-active-heartbeat-isolated-smoke.sql', 'POINT_CLOCK_ISOLATED_SMOKE_PASS'],
  ['points-verified-referrals-isolated-smoke.sql', 'REFERRAL_ISOLATED_NEGATIVE_SMOKE_PASS'],
  ['points-verified-referrals-positive-smoke.sql', 'REFERRAL_POSITIVE_SMOKE_PASS'],
  ['points-referral-hardening-isolated-smoke.sql', 'REFERRAL_HARDENING_ISOLATED_SMOKE_PASS'],
  ['points-admin-governance-isolated-smoke.sql', 'POINT_ADMIN_GOVERNANCE_SMOKE_PASS'],
];
let failed = 0;
for (const [file, marker, prelude = '', scope] of smokes) {
  if (existing && scope === 'stub-only') { console.log(`SKIP ${file} (needs isolated activity stubs; runs in stub mode)`); continue; }
  const sql = `BEGIN;\n${fixtures}\n${prelude}\n${readFileSync(join(root, 'test', file), 'utf8')}\nselect 'SMOKE_COMPLETED';\nROLLBACK;\n`;
  try {
    const out = psql([], sql);
    const ok = out.includes('SMOKE_COMPLETED') && (!marker || out.includes(marker));
    console.log(`${ok ? 'PASS' : 'FAIL'} ${file}`); if (!ok) failed++;
  } catch (e) { failed++; console.log(`FAIL ${file}\n${String(e.stderr || e.message).trim()}`); }
}
const after = psql(['-c', countSql]).trim();
if (after !== before) { failed++; console.log(`FAIL rollback residue rows before=${before} after=${after}`); }
else console.log('PASS rollback left no residue');
process.exit(failed ? 1 : 0);
