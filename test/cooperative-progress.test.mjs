import test from 'node:test';
import assert from 'node:assert/strict';
import {COOPERATIVES} from '../cooperative-registry.js';
import {COOP_LAUNCH_TASKS, initialCooperativeProgress, normalizeCooperativeProgress, cooperativeProgressSummary, cooperativeLaunchGuidance} from '../cooperative-progress.js';
import {loadCooperativeProject,normalizeCooperativeState} from '../cooperative-store.js';
import {routeCooperative} from '../cooperative-control.js';
import {cooperativePreparation} from '../cooperative-preparation.js';
import {fixture,authFetch} from './helpers/cooperative-fixture.mjs';
const [jubilee,open]=COOPERATIVES;
const patch=(coop,key,changes)=>({version:1,items:[{id:`${coop.workspaceId}:launch:${key}`,...changes}]});
const request=(coop,token='',method='GET',body,endpoint='project',origin='https://ekodi.kr')=>new Request(`https://ekodi.kr/${coop.publicSlug}/api/${endpoint}`,{method,headers:{...(token?{authorization:'Bearer '+token}:{}),...(body?{origin,'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
const sum=value=>cooperativeProgressSummary(value,COOP_LAUNCH_TASKS,'2026-10-28');

test('preparation worksheets mark unknown facts and packets include saved notes only with minimal identity data',async()=>{
 const f=fixture();
 try{
  for(const coop of COOPERATIVES){
   const state=(await loadCooperativeProject(f.db,coop)).state;
   state.founders[0].accountEmail='never-export@example.test';state.progress.items[0].evidence='unrelated-evidence-secret';
   const before=JSON.stringify(state),p=cooperativePreparation(state);
   assert.equal(JSON.stringify(state),before);
   assert.ok(p.planTemplate.includes(coop.name));assert.ok(p.budgetTemplate.includes(coop.name));
   assert.ok(p.planTemplate.length<2000&&p.budgetTemplate.length<2000);
   assert.match(p.packet,/주사무소: 미확정/);assert.match(p.packet,/첫해 예산: 미정/);
   assert.equal(p.packet.includes('never-export@example.test'),false);assert.equal(p.packet.includes('unrelated-evidence-secret'),false);
   assert.match(p.packet,/저장된 초안 없음/);
   state.progress.items[8].note='저장된 사업계획 초안';state.progress.items[9].note='저장된 예산 초안';
   const saved=cooperativePreparation(state);assert.match(saved.packet,/저장된 사업계획 초안/);assert.match(saved.packet,/저장된 예산 초안/);
  }
 }finally{f.sqlite.close();}
});
test('editing plan or budget draft content clears prior review even if a client tries to preserve it',()=>{
 for(const key of ['09','10','11']){
  let progress=initialCooperativeProgress(jubilee);
  progress=normalizeCooperativeProgress(patch(jubilee,key,{status:'완료',completedDate:'2026-10-28',evidence:'원본 위치',note:'이전 내용',verified:true}),jubilee,progress);
  progress=normalizeCooperativeProgress(patch(jubilee,key,{note:'변경된 내용',verified:true}),jubilee,progress);
  assert.equal(progress.items.find(r=>r.id.endsWith(':launch:'+key)).verified,key==='11');
 }
});
test('private preparation notes persist through existing scoped API without changing shared documents, legal state or another cooperative',async()=>{
 const f=fixture(),original=globalThis.fetch;globalThis.fetch=authFetch({owner:'chair@example.test',member:'member@example.test'});
 f.grant(jubilee,'chair@example.test','owner');f.grant(jubilee,'member@example.test','member');
 try{
  const before=await loadCooperativeProject(f.db,jubilee),other=await loadCooperativeProject(f.db,open);
  const state={progress:patch(jubilee,'09',{note:'private-preparation-content',verified:false})};
  const body=await (await routeCooperative(request(jubilee,'owner','PUT',{revision:before.revision,state}),f.env)).json();
  assert.equal(body.state.progress.items[8].note,'private-preparation-content');assert.deepEqual(body.state.documents,before.state.documents);assert.equal(body.state.profile.status,'formation');
  assert.deepEqual(await loadCooperativeProject(f.db,open),other);
  for(const endpoint of ['public','me']){const r=await routeCooperative(request(jubilee,endpoint==='me'?'member':'','GET',undefined,endpoint),f.env);assert.equal(r.status,200);assert.equal((await r.text()).includes('private-preparation-content'),false);}
  assert.equal((await routeCooperative(request(jubilee,'member','PUT',{revision:body.revision,state}),f.env)).status,403);
  assert.equal((await routeCooperative(request(jubilee,'owner','PUT',{revision:before.revision,state}),f.env)).status,409);
 }finally{globalThis.fetch=original;f.sqlite.close();}
});
test('over-limit draft content is rejected without truncation, revision change or audit writes; 2000 characters persist intact',async()=>{
 const f=fixture(),original=globalThis.fetch;globalThis.fetch=authFetch({owner:'chair@example.test'});f.grant(jubilee,'chair@example.test','owner');
 try{
  const before=await loadCooperativeProject(f.db,jubilee),auditBefore=f.sqlite.prepare('SELECT COUNT(*) AS n FROM cooperative_audit').get().n;
  const response=await routeCooperative(request(jubilee,'owner','PUT',{revision:before.revision,state:{progress:patch(jubilee,'09',{note:'가'.repeat(2011)})}}),f.env);
  assert.equal(response.status,400);assert.equal((await response.json()).code,'COOP_PROGRESS_NOTE_TOO_LONG');
  assert.deepEqual(await loadCooperativeProject(f.db,jubilee),before);assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM cooperative_audit').get().n,auditBefore);
  const exact='나'.repeat(2000);
  const saved=await routeCooperative(request(jubilee,'owner','PUT',{revision:before.revision,state:{progress:patch(jubilee,'09',{note:exact})}}),f.env);
  assert.equal(saved.status,200);assert.equal((await saved.json()).state.progress.items[8].note,exact);
 }finally{globalThis.fetch=original;f.sqlite.close();}
});

test('next guidance groups early work and exposes unresolved facts without completing or mutating either cooperative',async()=>{
 const f=fixture();
 try{
  const a=(await loadCooperativeProject(f.db,jubilee)).state,b=(await loadCooperativeProject(f.db,open)).state;
  const before=JSON.stringify([a,b]);
  const nextA=cooperativeLaunchGuidance(a,COOP_LAUNCH_TASKS,sum(a.progress));
  const nextB=cooperativeLaunchGuidance(b,COOP_LAUNCH_TASKS,sum(b.progress));
  assert.deepEqual(nextA.actions.map(a=>a.key),['01','03','04']);
  assert.deepEqual(nextB.actions.map(a=>a.key),['01','03','04']);
  assert.equal(nextB.signals.some(s=>s.text.includes('이남현1')),true);
  assert.equal(nextA.signals.some(s=>s.text.includes('이남현1')),false);
  assert.ok(nextA.parallel[0].key>='29');
  assert.equal(nextA.agendaTitle.includes(jubilee.name),true);assert.equal(nextA.agendaBody.includes('미정'),true);
  assert.equal(nextB.agendaTitle.includes(open.name),true);
  assert.equal(JSON.stringify([a,b]),before);
 }finally{f.sqlite.close();}
});
test('unreviewed completion and a hold keep the same prerequisite actionable; input names never prove participation',async()=>{
 const f=fixture();
 try{
  const state=(await loadCooperativeProject(f.db,jubilee)).state;
  state.progress=normalizeCooperativeProgress(patch(jubilee,'01',{status:'완료',nextAction:'확인 내용 <script>실행 금지</script>'}),jubilee,state.progress);
  let next=cooperativeLaunchGuidance(state,COOP_LAUNCH_TASKS,sum(state.progress));
  assert.equal(next.actions[0].key,'01');assert.equal(next.actions[0].needsReview,true);assert.match(next.actions[0].action,/완료일/);
  assert.equal(next.actions[0].nextAction,'확인 내용 <script>실행 금지</script>');
  state.progress=normalizeCooperativeProgress(patch(jubilee,'01',{status:'보류',note:'참여 의사 확인 중'}),jubilee,state.progress);
  next=cooperativeLaunchGuidance(state,COOP_LAUNCH_TASKS,sum(state.progress));
  assert.equal(next.actions[0].key,'01');assert.match(next.actions[0].title,/보류/);assert.equal(next.phase,1);
 }finally{f.sqlite.close();}
});
test('reviewed prerequisites advance guidance while later deadlines never jump past earlier work',async()=>{
 const f=fixture();
 try{
  const state=(await loadCooperativeProject(f.db,jubilee)).state;
  const done=key=>({id:`${jubilee.workspaceId}:launch:${key}`,status:'완료',completedDate:'2026-10-28',evidence:'오프라인 시험 원본 위치',verified:true});
  state.progress=normalizeCooperativeProgress({version:1,items:[done('01'),done('21')]},jubilee,state.progress);
  let next=cooperativeLaunchGuidance(state,COOP_LAUNCH_TASKS,sum(state.progress));
  assert.equal(next.actions[0].key,'02');assert.equal(next.signals.find(s=>s.key==='01').reconcile,true);
  state.progress=normalizeCooperativeProgress({version:1,items:['02','03','04','05','06'].map(done)},jubilee,state.progress);
  next=cooperativeLaunchGuidance(state,COOP_LAUNCH_TASKS,sum(state.progress));
  assert.equal(next.phase,2);assert.equal(next.actions[0].key,'07');assert.equal(state.profile.status,'formation');
  assert.equal(next.actions.some(a=>a.key==='23'),false);
 }finally{f.sqlite.close();}
});
test('legal execution stays sequential and founding assembly waits for its reviewed publication interval',async()=>{
 const f=fixture();
 try{
  const state=(await loadCooperativeProject(f.db,jubilee)).state;
  const done=key=>({id:`${jubilee.workspaceId}:launch:${key}`,status:'완료',completedDate:key==='14'?'2026-10-20':'2026-10-28',evidence:'시험 원본 위치',verified:true});
  const completeThrough=count=>{state.progress=normalizeCooperativeProgress({version:1,items:COOP_LAUNCH_TASKS.slice(0,count).map(t=>done(t.key))},jubilee,initialCooperativeProgress(jubilee));};
  completeThrough(13);
  let next=cooperativeLaunchGuidance(state,COOP_LAUNCH_TASKS,sum(state.progress));
  assert.deepEqual(next.actions.map(a=>a.key),['14']);
  completeThrough(14);
  state.progress.items[13].completedDate='2026-10-28';
  next=cooperativeLaunchGuidance(state,COOP_LAUNCH_TASKS,sum(state.progress));
  assert.deepEqual(next.actions.map(a=>a.key),['15']);assert.equal(next.actions[0].awaitingDate,true);assert.match(next.actions[0].action,/2026-11-05/);
  const onDate=cooperativeProgressSummary(state.progress,COOP_LAUNCH_TASKS,'2026-11-05');
  assert.equal(cooperativeLaunchGuidance(state,COOP_LAUNCH_TASKS,onDate).actions[0].awaitingDate,false);
  completeThrough(21);
  next=cooperativeLaunchGuidance(state,COOP_LAUNCH_TASKS,sum(state.progress));
  assert.deepEqual(next.actions.map(a=>a.key),['22']);
  state.progress.items[13].completedDate='2026-10-28';
  next=cooperativeLaunchGuidance(state,COOP_LAUNCH_TASKS,sum(state.progress));
  assert.deepEqual(next.actions.map(a=>a.key),['15']);assert.match(next.actions[0].action,/보다 빠릅니다/);
  assert.equal(state.progress.items[14].verified,true);
  state.progress.items[13].completedDate='2026-10-20';
  completeThrough(22);
  assert.deepEqual(cooperativeLaunchGuidance(state,COOP_LAUNCH_TASKS,sum(state.progress)).actions.map(a=>a.key),['23']);
 }finally{f.sqlite.close();}
});

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
