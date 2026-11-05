import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {analyzeJubileeProjects} from '../scripts/jubilee-owner-project-readback.mjs';
const owner='65602d0d-a5f7-42d2-9827-fa20c5b39da2';
const ids=['02e915c2-d354-48bc-b5b7-4a3adccb9230','99f3fb61-8f0b-49f7-b057-a5b583bc2154'];
const records=[
  {id:ids[0],author_user_id:owner,title:'희년과 하나님 나라의 회복',stage:'drafting',revision:2,manuscript_digest:'a'.repeat(64)},
  {id:ids[1],author_user_id:owner,title:'우리는 다시 돌아갈 수 있는가',stage:'planning',revision:1,manuscript_digest:null}
];
const wrap=rows=>JSON.stringify([{results:rows,success:true}]);
test('private project preflight proves two distinct exact-title author-owned projects',()=>{
  const r=analyzeJubileeProjects(wrap(records),owner);
  assert.equal(r.readyForPrivateIntake,true);
  assert.equal(r.registered,2);
  assert.deepEqual(r.books.map(b=>b.digestRecorded),[true,false]);
  assert.ok(!JSON.stringify(r).includes(owner));
  assert.ok(!JSON.stringify(r).includes(ids[0]));
  assert.ok(!JSON.stringify(r).includes(ids[1]));
});
test('missing or duplicate title, wrong owner or reused ID cannot produce private intake green',()=>{
  for(const rows of [
    records.slice(1),[...records,records[0]],[records[0],{...records[1],id:ids[0]}],
    [{...records[0],author_user_id:ids[1]},records[1]],
    records.map(x=>({...x,title:'unrelated'})),
  ])assert.equal(analyzeJubileeProjects(wrap(rows),owner).readyForPrivateIntake,false);
});
test('incomplete D1 response or invalid owner is rejected',()=>{
  assert.throws(()=>analyzeJubileeProjects('not json',owner));
  assert.throws(()=>analyzeJubileeProjects(wrap(records),'not-a-uuid'));
});
test('read-only workflow is release-gated, privacy-safe, no write methods or public artifacts',()=>{
  const w=readFileSync(new URL('../.github/workflows/publishing-jubilee-project-readback.yml',import.meta.url),'utf8');
  assert.match(w,/workflow_dispatch:/);
  assert.match(w,/name: EKODI AI Orchestration Gate/);
  assert.match(w,/validate-ekodi-ai-change-orchestration/);
  assert.match(w,/wrangler@4\.119\.0 d1 execute .*--remote --json/);
  assert.match(w,/PUBLISHING_JUBILEE_AUTHOR_USER_ID:.*secrets\./);
  assert.match(w,/SELECT id,title,author_user_id,stage,revision,manuscript_digest FROM/);
  assert.doesNotMatch(w,/\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE)\b/);
  assert.doesNotMatch(w,/(?:upload-artifact|pull_request:|wrangler .* deploy|r2 object put)/i);
});
