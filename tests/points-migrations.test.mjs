// Static security regression checks for the site activity points migrations.
// Run: node --test tests/points-migrations.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const dir = new URL('../supabase/migrations/', import.meta.url);
const read = (name) => readFileSync(new URL(name, dir), 'utf8');
const foundation = read('20261029210000_ekodi_site_activity_points_foundation.sql');
const award = read('20261030021500_ekodi_points_private_awards.sql');
const spend = read('20261030030000_ekodi_points_private_spend.sql');
const transfer = read('20261030040000_ekodi_points_private_transfer.sql');
const donation = read('20261030050000_ekodi_points_private_donations.sql');
test('all point ledgers and wallets have RLS and no browser write privileges', () => {
  for (const table of ['ekodi_point_wallets','ekodi_point_ledger','ekodi_point_rules','ekodi_point_sites','ekodi_point_transfer_policies']) {
    assert.match(foundation, new RegExp('alter table public\\.' + table + ' enable row level security', 'i'));
  }
  assert.match(foundation, /revoke all on table public\\.ekodi_point_sites,[\\s\\S]*from public, anon, authenticated, service_role/i);
  assert.match(foundation, /grant select on table public\\.ekodi_point_sites,[\\s\\S]*to service_role/i);
  for (const table of ['ekodi_point_donation_campaigns','ekodi_point_donations']) {
    assert.match(donation, new RegExp('alter table public\\.' + table + ' enable row level security', 'i'));
  }
});
test('all mutations are in private schema with no browser execute grants', () => {
  for (const [sql,fn] of [[award,'award_activity'],[spend,'spend'],[transfer,'transfer_points'],[donation,'donate_points']]) {
    assert.match(sql, new RegExp('function ekodi_points_private\\.' + fn + '\\('));
    assert.match(sql, /security definer/i);
    assert.match(sql, /set search_path = pg_catalog, public/i);
    assert.match(sql, new RegExp('revoke all on function ekodi_points_private\\.' + fn + '\\([\\s\\S]*?from public,anon,authenticated','i'));
    assert.match(sql, new RegExp('grant execute on function ekodi_points_private\\.' + fn + '\\([\\s\\S]*?to service_role','i'));
  }
});
test('every balance mutation records a ledger entry and locks wallets', () => {
  for (const sql of [award,spend,transfer,donation]) {
    assert.match(sql, /pg_advisory_xact_lock/i);
    assert.match(sql, /insert into public\.ekodi_point_ledger/i);
    assert.match(sql, /event_key/i);
  }
});
test('transfers and donations cannot run without enabled policy/campaign', () => {
  assert.match(transfer, /v_policy\.daily_cap/);
  assert.match(transfer, /and enabled for update/);
  assert.match(donation, /DONATION_CAMPAIGN_INACTIVE/);
  assert.match(donation, /INSUFFICIENT_BALANCE/);
});

test('wallets and donations bind to canonical EKODI person rather than OAuth identity', () => {
  assert.match(foundation, /user_id uuid not null references public\.people\(id\)/i);
  assert.match(donation, /user_id uuid not null references public\.people\(id\)/i);
  assert.doesNotMatch(foundation, /references auth\.users\(id\)/i);
  assert.doesNotMatch(donation, /references auth\.users\(id\)/i);
});
