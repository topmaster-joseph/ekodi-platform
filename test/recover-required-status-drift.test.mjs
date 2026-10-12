import test from 'node:test';
import assert from 'node:assert/strict';
import {
  latestStatusByContext, waitForVerifiedHeadStatus, verifiedHeadPr,
} from '../scripts/recover-required-status-drift.mjs';

const head = 'a'.repeat(40);
const required = ['test', 'EKODI AI Orchestration Gate'];
const status = (context, state) => ({context,state,target_url:'https://github.com/runner/check'});

test('latest head status must not be overwritten by stale historic failures', () => {
  const observed = latestStatusByContext([status('test','success'),status('test','failure')]);
  assert.equal(observed.get('test').state,'success');
});

test('delayed AI orchestration check is awaited and never treated as an immediate CI failure', async () => {
  let count=0;
  const statuses=await waitForVerifiedHeadStatus({
    head,required,now:()=>1000,sleep:async()=>{},timeoutMs:100,pollMs:10,
    getStatuses:async()=>({statuses:[status('test','success'),
      status('EKODI AI Orchestration Gate',++count>1?'success':'pending')]}),
  });
  assert.equal(statuses.get('EKODI AI Orchestration Gate').state,'success');
  assert.equal(count,2);
});

test('failing required status is not repaired or bypassed',async()=>{
  await assert.rejects(waitForVerifiedHeadStatus({
    head,required,now:()=>0,sleep:async()=>{},timeoutMs:10,
    getStatuses:async()=>({statuses:[status('test','success'),
      status('EKODI AI Orchestration Gate','failure')]}),
  }),/required head status failed/);
});

test('pending required status times out rather than being declared passed',async()=>{
  let clock=0;
  await assert.rejects(waitForVerifiedHeadStatus({
    head,required,now:()=>clock,sleep:async()=>{clock+=6},pollMs:6,timeoutMs:10,
    getStatuses:async()=>({statuses:[status('test','success')]}),
  }),/still pending/);
});

test('recovery checks current PR identity, base, state, head and merge SHA',()=>{
  const valid={state:'open',draft:false,base:{ref:'main'},
    head:{sha:head},merge_commit_sha:'b'.repeat(40)};
  assert.equal(verifiedHeadPr(valid,head),'b'.repeat(40));
  assert.throws(()=>verifiedHeadPr({...valid,draft:true},head),/eligible/);
  assert.throws(()=>verifiedHeadPr({...valid,head:{sha:'c'.repeat(40)}},head),/head changed/);
  assert.throws(()=>verifiedHeadPr({...valid,merge_commit_sha:null},head),/merge sha unavailable/);
});

test('late CI failures must revoke a prior success status and never leave required test green', async () => {
  const { readFileSync } = await import('node:fs');
  const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
  assert.match(workflow, /Revoke premature legacy success if late recovery step fails/);
  assert.match(workflow, /github\.event_name == 'pull_request' && failure\(\)/);
  assert.match(workflow, /--arg state failure --arg context test/);
  assert.match(workflow, /statuses\/\$\{sha\}/);
});
