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

// 2026-10-20: merge-SHA races caused by a fast-moving main are retried with a
// fresh PR read; identity failures are not retried and nothing passes unverified.
import { reconcileMergeStatuses, isTransientMergeShaError } from '../scripts/recover-required-status-drift.mjs';
const HEAD='a'.repeat(40),M1='b'.repeat(40),M2='c'.repeat(40);
const evidence=new Map([['test',{state:'success',target_url:'https://example/t'}],['EKODI AI Orchestration Gate',{state:'success',target_url:'https://example/g'}]]);
function fakeApi(prSequence){
  const posted=new Map();let reads=0;
  const api=async(route,init={})=>{
    if(route.startsWith('/pulls/')){const pr=prSequence[Math.min(reads,prSequence.length-1)];reads++;return pr}
    if(route.startsWith('/statuses/')){const sha=route.split('/')[2];const body=JSON.parse(init.body);posted.set(sha+'|'+body.context,body.state);return {}}
    if(route.startsWith('/commits/')){const sha=route.split('/')[2];return {statuses:[...posted].filter(([k])=>k.startsWith(sha+'|')).map(([k,state])=>({context:k.split('|')[1],state}))}}
    throw new Error('unexpected '+route);
  };
  return {api,posted,reads:()=>reads};
}
const openPr=merge=>({state:'open',draft:false,base:{ref:'main'},head:{sha:HEAD},merge_commit_sha:merge});
const noSleep=async()=>{};

test('missing merge SHA while GitHub recomputes is retried, then reconciled',async()=>{
  const f=fakeApi([openPr(null),openPr(M1)]);
  const r=await reconcileMergeStatuses({api:f.api,pr:'1',head:HEAD,by:evidence,sleep:noSleep});
  assert.equal(r.mergeSha,M1);
  assert.equal(r.attempt,2);
  assert.equal(f.posted.get(M1+'|test'),'success');
});

test('merge SHA moving mid-step retries against the new merge commit',async()=>{
  const f=fakeApi([openPr(M1),openPr(M2),openPr(M2),openPr(M2)]);
  const r=await reconcileMergeStatuses({api:f.api,pr:'1',head:HEAD,by:evidence,sleep:noSleep});
  assert.equal(r.mergeSha,M2);
  assert.equal(f.posted.get(M2+'|EKODI AI Orchestration Gate'),'success');
});

test('head change is not retried and still fails closed',async()=>{
  const f=fakeApi([{...openPr(M1),head:{sha:'d'.repeat(40)}}]);
  await assert.rejects(reconcileMergeStatuses({api:f.api,pr:'1',head:HEAD,by:evidence,sleep:noSleep}),/PR head changed/);
  assert.equal(f.reads(),1);
});

test('persistent missing merge SHA gives up after bounded attempts',async()=>{
  const f=fakeApi([openPr(null)]);
  await assert.rejects(reconcileMergeStatuses({api:f.api,pr:'1',head:HEAD,by:evidence,sleep:noSleep,attempts:3}),/current merge sha unavailable/);
  assert.equal(f.reads(),3);
  assert.equal(f.posted.size,0);
});

test('missing head evidence is never retried into a pass',async()=>{
  const f=fakeApi([openPr(M1)]);
  const partial=new Map([['test',{state:'success',target_url:'https://example/t'}]]);
  await assert.rejects(reconcileMergeStatuses({api:f.api,pr:'1',head:HEAD,by:partial,sleep:noSleep}),/required head evidence missing/);
  assert.equal(f.reads(),0);
  assert.equal(isTransientMergeShaError(new Error('PR is no longer eligible for merge status reconciliation')),false);
});
