import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {auditMigrationText} from '../scripts/validate-supabase-public-grants.mjs';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');

const MIGRATION='supabase/migrations/20261101090000_person_merge_requests.sql';

test('merge request table is private, service-role only, one open request per pair',async()=>{
  const sql=await read(MIGRATION);
  assert.deepEqual(auditMigrationText(sql,MIGRATION),[]);
  assert.match(sql,/alter table public\.person_merge_requests enable row level security/);
  assert.match(sql,/revoke all on public\.person_merge_requests from public, anon, authenticated/);
  assert.match(sql,/where status in \('pending','approved'\)/);
  assert.match(sql,/check \(survivor_person_id <> absorbed_person_id\)/);
  assert.match(sql,/revoke all on function public\.person_merge_inventory\(uuid, uuid\) from public, anon, authenticated/);
  // Phase 1 moves nothing: no UPDATE/DELETE on member data, and the reparent guard is untouched.
  const body=sql.slice(sql.indexOf('create or replace function public.person_merge_inventory'));
  assert.doesNotMatch(body,/\b(update|delete|insert)\s+(into\s+)?public\./i);
  assert.match(body,/\bstable\b/);
  assert.doesNotMatch(sql,/drop trigger/i,'the reparent guard stays in force');
  assert.match(body,/reported once, by its larger count/);
});

test('identity-api turns a proven cross-Person link into an owner-scoped merge request',async()=>{
  const api=await read('supabase/functions/identity-api/index.ts');
  assert.match(api,/const mergeRequest=initiatorPersonId\?await openMergeRequest\(initiatorPersonId,targetPersonId,userId,target\.user\.id,provider\):null;/);
  assert.match(api,/return json\(req,\{error:"account_merge_review_required",mergeRequest\},409\)/);
  // Only the surviving Person can read, cancel or (phase 2) execute.
  assert.match(api,/data&&data\.survivor_person_id===personId\?data:null/);
  assert.match(api,/action:?\s*"identity\.merge_requested"|"identity\.merge_requested"/);
});

test('callback shows the inventory as text only and states nothing moves before the owner decides',async()=>{
  const src=await read('auth-site/federated-login.js');
  // The module imports supabase-js from a CDN, so run the real function from its source.
  const fnSrc=src.slice(src.indexOf('export function mergeReportLines'),src.indexOf('function renderMergeReport')).replace('export function','function');
  const mergeReportLines=new Function(fnSrc+'\nreturn mergeReportLines;')();
  assert.doesNotMatch(src.slice(src.indexOf('function renderMergeReport')),/innerHTML/);
  const lines=mergeReportLines({inventory:{absorbedRows:4,verdict:'mergeable',items:[{table:'profiles',absorbedRows:1,financial:false}]}},'카카오');
  {
    assert.match(lines[0],/카카오 계정에 있는 기록 4건/);
    assert.match(lines[1],/합칠 수 있는 상태/);
    assert.match(lines.at(-1),/본인이 결정/);
    const blocked=mergeReportLines({inventory:{absorbedRows:9,verdict:'needs_resolution',items:[{table:'singles_bank_orders',absorbedRows:2,financial:true}]}},'카카오');
    assert.match(blocked[1],/정리가 필요/);
    assert.ok(blocked.some(l=>l.includes('singles_bank_orders: 2건')));
  }
  assert.match(await read('auth-site/auth-router.js'),/federated-login\.js\?v=20261102-merge-policy-1/);
});
