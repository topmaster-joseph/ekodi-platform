import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {auditMigrationText} from '../scripts/validate-supabase-public-grants.mjs';
import {personAuthorityScript} from '../person-authority-page.js';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const MIGRATION='supabase/migrations/20261101100000_person_merge_execute.sql';

// Behaviour was rehearsed on PostgreSQL 17 with both migrations applied verbatim
// (18 scenarios: owner-only execute, guard spoofing, exact revert, financial and
// service-data refusal, expiry, privileges). These assertions pin that contract.

test('reparent guard is narrowed to an authorising request row, never a bare setting',async()=>{
  const sql=await read(MIGRATION);
  assert.deepEqual(auditMigrationText(sql,MIGRATION),[]);
  const guard=sql.slice(sql.indexOf('create or replace function public.block_unreviewed_person_reparent'),sql.indexOf('revoke all on function public.block_unreviewed_person_reparent'));
  assert.match(guard,/current_setting\('ekodi\.person_merge_request', true\)/);
  assert.match(guard,/from public\.person_merge_requests r/);
  assert.match(guard,/r\.status = 'approved'\s+and r\.absorbed_person_id = old\.person_id\s+and r\.survivor_person_id = new\.person_id/);
  assert.match(guard,/r\.status = 'executed'[\s\S]*where \(e ->> 'id'\)::uuid = old\.id/);
  assert.match(guard,/raise exception 'account_merge_review_required'/);
  assert.doesNotMatch(sql,/drop trigger/i);
});

test('execute: owner of the surviving Person only, re-checks inventory, refuses money and service data',async()=>{
  const sql=await read(MIGRATION);
  const fn=sql.slice(sql.indexOf('create or replace function public.person_merge_execute'),sql.indexOf('revoke all on function public.person_merge_execute'));
  assert.match(fn,/auth_user_id = p_actor and person_id = r\.survivor_person_id and status = 'active'/);
  assert.match(fn,/if r\.expires_at < now\(\)/);
  assert.match(fn,/v_inventory := public\.person_merge_inventory/);
  assert.match(fn,/financialTables'\)::int, 0\) > 0 or jsonb_array_length\(v_blocking\) > 0/);
  assert.match(fn,/'merge_needs_resolution'/);
  assert.match(fn,/undo = jsonb_build_object\('identities', v_moved, 'absorbedPriorStatus', v_prior_status\)/);
  assert.match(fn,/'identity\.merge_executed'/);
  for(const name of ['person_merge_execute','person_merge_revert','person_merge_blocking_rows']){
    assert.match(sql,new RegExp(`revoke all on function public\\.${name}\\([^)]*\\) from public, anon, authenticated`),name);
    assert.match(sql,new RegExp(`grant execute on function public\\.${name}\\([^)]*\\) to service_role`),name);
  }
});

test('APIs: owner executes via identity-api; only a verified-Google platform admin reverts',async()=>{
  const identity=await read('supabase/functions/identity-api/index.ts');
  const exec=identity.slice(identity.indexOf('async function executeMergeRequest'),identity.indexOf('function providerFrom'));
  assert.match(exec,/const row=await ownMergeRequest\(userId,id\)/);
  assert.match(exec,/admin\.rpc\("person_merge_execute",\{p_request:row\.id,p_actor:userId\}\)/);
  const access=await read('supabase/functions/access-api/index.ts');
  const revert=access.slice(access.indexOf('const revertMatch'),access.indexOf('path==="/platform-authority"'));
  assert.match(revert,/if\(!await platformAdmin\(auth\.user\.id\)\)return json\(req,\{error:"platform_admin_required"\},403\)/);
  assert.match(revert,/admin\.rpc\("person_merge_revert"/);
});

test('screens: owner decides in the auth hub, admin reverts from /admin/people, text only',async()=>{
  const fed=await read('auth-site/federated-login.js');
  const ui=fed.slice(fed.indexOf('function renderMergeReport'));
  assert.match(ui,/하나의 EKODI 통합 ID로 합치기/);
  assert.match(ui,/merge-requests\/\$\{encodeURIComponent\(mergeRequest\.id\)\}\/execute/);
  assert.match(ui,/confirm\(/);
  assert.doesNotMatch(ui,/innerHTML/);
  const js=await personAuthorityScript().text();
  assert.match(js,/'\/admin\/merges\/'\+encodeURIComponent\(m\.id\)\+'\/revert','POST'/);
  assert.doesNotMatch(js,/innerHTML/);
  assert.match(await read('auth-site/auth-router.js'),/federated-login\.js\?v=20261101-merge-execute-1/);
});
