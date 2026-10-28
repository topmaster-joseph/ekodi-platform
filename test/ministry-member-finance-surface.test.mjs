import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(path,import.meta.url),'utf8');
const route=read('../space-worker.js');
const page=read('../space/ekodimission-finance.page');
const client=read('../space/ekodimission-finance.js');
const sql=read('../supabase/migrations/20261028000709_ministry_member_finance_disclosure_v1.sql');
const seal=read('../supabase/migrations/20261028000938_ministry_finance_approved_snapshot_seal_v2.sql');

test('mission finance route is a private, nonindexed site surface',()=>{
  assert.match(route,/\/ekodimission\/my\/finance/);
  assert.match(route,/\/ekodimission-finance\.page/);
  assert.match(route,/\/ekodimission\/assets\/finance\.js/);
  assert.match(route,/isPrivateFinance\?await asset\.text\(\):publishMissionHtml/);
  assert.match(route,/x-ekodi-publication-status','member-private'/);
  assert.match(route,/x-robots-tag','noindex, nofollow, noarchive'/);
  assert.match(page,/data-ekodi-ministry-private="finance"/);
  assert.match(page,/noindex,nofollow,noarchive/);
});
test('mission member can choose period and categories, never raw banking documents',()=>{
  assert.match(page,/name="section" value="income"/);
  assert.match(page,/name="section" value="expense"/);
  assert.match(page,/name="section" value="budget"/);
  assert.match(client,/ministry-member-finance-api/);
  assert.match(client,/headers:\{authorization:'Bearer '\+accessToken/);
  assert.match(client,/cache:'no-store'/);
  assert.doesNotMatch(client,/\.innerHTML\s*=/);
  assert.doesNotMatch(client,/service_role|SUPABASE_SERVICE_ROLE_KEY/);
});
test('private schema has no direct client grants and member RPC checks tenant membership',()=>{
  assert.match(sql,/create schema if not exists ministry_private/);
  assert.match(sql,/alter table ministry_private\.finance_publications enable row level security/);
  assert.match(sql,/alter table ministry_private\.finance_publication_blocks enable row level security/);
  assert.match(sql,/revoke all on ministry_private\.finance_publications/);
  assert.match(sql,/revoke all on function public\.ministry_finance_read_context/);
  assert.match(sql,/public\.tenant_members m/);
  assert.match(sql,/m\.user_id=p_subject_id and m\.status='active'/);
  assert.match(sql,/p\.status='approved'/);
});
test('approved report and detail blocks are sealed after approval',()=>{
  assert.match(seal,/sealed finance publication is immutable/);
  assert.match(seal,/sealed finance publication blocks are immutable/);
  assert.match(seal,/ministry_finance_publication_seal/);
  assert.match(seal,/ministry_finance_block_seal/);
});
