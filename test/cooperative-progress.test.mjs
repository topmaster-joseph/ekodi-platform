import test from 'node:test';
import assert from 'node:assert/strict';
import {COOPERATIVES} from '../cooperative-registry.js';
import {COOP_LAUNCH_TASKS, initialCooperativeProgress, normalizeCooperativeProgress, cooperativeProgressSummary} from '../cooperative-progress.js';
import {loadCooperativeProject,normalizeCooperativeState} from '../cooperative-store.js';
import {routeCooperative} from '../cooperative-control.js';
import {fixture,authFetch} from './helpers/cooperative-fixture.mjs';
const [jubilee,open]=COOPERATIVES;
const patch=(coop,key,changes)=>({version:1,items:[{id:`${coop.workspaceId}:launch:${key}`,...changes}]});
const request=(coop,token='',method='GET',body,endpoint='project',origin='https://ekodi.kr')=>new Request(`https://ekodi.kr/${coop.publicSlug}/api/${endpoint}`,{method,headers:{...(token?{authorization:'Bearer '+token}:{}),...(body?{origin,'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
const sum=value=>cooperativeProgressSummary(value,COOP_LAUNCH_TASKS,'2026-10-28');

test('old snapshots gain 33 independent private defaults on read without writes or revision changes',async()=>{
 const f=fixture(),before=f.sqlite.prepare('SELECT * FROM cooperative_projects').all();
 const a=await loadCooperativeProject(f.db,jubilee),b=await loadCooperativeProject(f.db,open);
 assert.equal(a.state.progress.items.length,33);assert.equal(b.state.progress.items.length,33);
 assert.equal(a.state.progress.items[0].status,'확인필요');assert.notEqual(a.state.progress.items[0].id,b.state.progress.items[0].id);
 assert.deepEqual(f.sqlite.prepare('SELECT * FROM cooperative_projects').all(),before);f.sqlite.close();
});
test('completion requires explicit review, date and evidence; revised evidence clears review; legal profile stays formation',()=>{
 let state=initialCooperativeProgress(jubilee);
 state=normalizeCooperativeProgress(patch(jubilee,'01',{status:'완료',verified:true}),jubilee,state);assert.equal(sum(state).completed,0);
 state=normalizeCooperativeProgress(patch(jubilee,'01',{completedDate:'2026-10-28',evidence:'참여동의 원본 위치',verified:true}),jubilee,state);assert.equal(sum(state).completed,1);
 state=normalizeCooperativeProgress(patch(jubilee,'01',{evidence:'새 증빙',verified:true}),jubilee,state);assert.equal(state.items[0].verified,false);assert.equal(sum(state).completed,0);
 state=normalizeCooperativeProgress(patch(jubilee,'01',{verified:true}),jubilee,state);assert.equal(sum(state).completed,1);
 state=normalizeCooperativeProgress(patch(jubilee,'01',{status:'진행중',verified:true}),jubilee,state);assert.equal(state.items[0].verified,false);
});
test('mandatory cannot be excluded; optional needs reason; hold stays in denominator; predecessor gaps remain visible',()=>{
 let state=initialCooperativeProgress(jubilee);
 assert.throws(()=>normalizeCooperativeProgress(patch(jubilee,'01',{status:'해당없음',note:'편의상 제외'}),jubilee,state),{code:'COOP_PROGRESS_EXCLUSION'});
 assert.throws(()=>normalizeCooperativeProgress(patch(jubilee,'18',{status:'해당없음'}),jubilee,state),{code:'COOP_PROGRESS_EXCLUSION'});
 state=normalizeCooperativeProgress(patch(jubilee,'18',{status:'해당없음',note:'신고 보완요구 없음'}),jubilee,state);
 assert.equal(sum(state).total,32);
 state=normalizeCooperativeProgress(patch(jubilee,'01',{status:'보류'}),jubilee,state);assert.equal(sum(state).total,32);assert.equal(sum(state).phases[1].ready,false);assert.equal(sum(state).phases[5].parallel,true);assert.equal(sum(state).phases[5].ready,true);
});
test('dates and task fields are validated; tenant IDs, duplicates and forged authority cannot enter state',()=>{
 const before=initialCooperativeProgress(jubilee);
 for(const changes of [{targetDate:'2026-02-30'},{verified:'true'},{owner:{role:'admin'}},{status:'등기완료'}])assert.throws(()=>normalizeCooperativeProgress(patch(jubilee,'01',changes),jubilee,before));
 for(const p of [patch(open,'01',{owner:'다른 조합'}),{version:2,items:[]},{version:1,items:[{id:before.items[0].id,role:'owner'}]},{version:1,items:[{id:before.items[0].id},{id:before.items[0].id}]}])assert.throws(()=>normalizeCooperativeProgress(p,jubilee,before));
 assert.deepEqual(before,initialCooperativeProgress(jubilee));
});
test('deadline calculations need completed reviewed anchors; exact deadline is not overdue, following day is',()=>{
 let state=initialCooperativeProgress(jubilee);state=normalizeCooperativeProgress({version:1,items:[{id:state.items[13].id,status:'완료',completedDate:'2026-10-01',evidence:'공고 원본',verified:true},{id:state.items[20].id,status:'완료',completedDate:'2026-10-14',evidence:'납입 대사',verified:true}]},jubilee,state);
 assert.equal(sum(state).earliestMeeting,'2026-10-09');assert.equal(sum(state).registrationDeadline,'2026-10-28');assert.equal(sum(state).rows[22].overdue,false);
 assert.equal(cooperativeProgressSummary(state,COOP_LAUNCH_TASKS,'2026-10-29').rows[22].overdue,true);
 state=normalizeCooperativeProgress(patch(jubilee,'21',{verified:false}),jubilee,state);assert.equal(sum(state).registrationDeadline,'');
});
test('admin API save/read persists and audits one workspace; no private projection, cross-member or stale writes',async()=>{
 const f=fixture(),original=globalThis.fetch;globalThis.fetch=authFetch({owner:'chair@example.test',member:'member@example.test'});
 f.grant(jubilee,'chair@example.test','owner');f.grant(jubilee,'member@example.test','member');
 try{
  const a=await loadCooperativeProject(f.db,jubilee),other=await loadCooperativeProject(f.db,open);
  const state={progress:patch(jubilee,'01',{owner:'정찬균',status:'진행중',targetDate:'2026-11-02',nextAction:'실명 확인',note:'private-progress-marker'})};
  assert.equal((await routeCooperative(request(jubilee,'member','PUT',{revision:a.revision,state}),f.env)).status,403);
  assert.equal((await routeCooperative(request(open,'owner','PUT',{revision:other.revision,state}),f.env)).status,403);
  assert.equal((await routeCooperative(request(jubilee,'owner','PUT',{revision:a.revision,state},'project','https://evil.example'),f.env)).status,403);
  const saved=await routeCooperative(request(jubilee,'owner','PUT',{revision:a.revision,state}),f.env);assert.equal(saved.status,200);
  const b=await saved.json();assert.equal(b.state.progress.items[0].owner,'정찬균');assert.equal(b.state.profile.status,'formation');assert.equal(b.revision,a.revision+1);
  assert.deepEqual((await loadCooperativeProject(f.db,open)),other);
  assert.equal((await routeCooperative(request(jubilee,'owner','PUT',{revision:a.revision,state}),f.env)).status,409);
  const reread=await (await routeCooperative(request(jubilee,'owner'),f.env)).json();assert.equal(reread.state.progress.items[0].nextAction,'실명 확인');
  for(const endpoint of ['public','me']){const r=await routeCooperative(request(jubilee,endpoint==='me'?'member':'','GET',undefined,endpoint),f.env);assert.equal(r.status,200);const raw=await r.text();assert.equal(raw.includes('private-progress-marker'),false);assert.equal(raw.includes('"progress"'),false);}
  const normal=normalizeCooperativeState({profile:{purpose:'기존 다른 탭 저장'}},jubilee,reread.state);assert.deepEqual(normal.progress,reread.state.progress);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM cooperative_audit WHERE workspace_id=?").get(jubilee.workspaceId).n,1);
 }finally{globalThis.fetch=original;f.sqlite.close();}
});
