import test from 'node:test';
import assert from 'node:assert/strict';
import {projectSiteAiFleet,readSiteAiFleet} from '../ekodi-site-ai-fleet-readonly.js';

const registry={existingWorkspaceSites:[
 {id:'ekodi-church',name:'에코디교회',class:'workspace_user_site',canonicalUrl:'https://ekodi.kr/ekodichurch',migrationState:'retain_existing'},
 {id:'mal',name:'Evil',class:'workspace_user_site',canonicalUrl:'https://evil.invalid/a',migrationState:'active'},
 {id:'planned',name:'Planned',class:'planned_surface',canonicalUrl:'https://ekodi.kr/future',migrationState:'planned'},
 {id:'mal2',name:'Evil path',class:'workspace_user_site',canonicalUrl:'https://ekodi.kr/admin/control?override=1',migrationState:'active'},
]};
const valid={site_id:'ekodi-church',run_day:'2026-11-12',state:'running',task_id:'orch_abcd1234abcd1234',pull_request_number:9333,merge_sha:'a'.repeat(40),secret:'should_never_be_exposed'};

test('only canonical EKODI workspace-site locators survive catalog projection',()=>{
 const p=projectSiteAiFleet(registry,[valid],{ledgerAvailable:true});
 assert.equal(p.siteCount,1);assert.equal(p.entries[0].detailPath,'/ekodichurch/admin/services');
});
test('site improvement is never evidence of an active site AI or production',()=>{
 const p=projectSiteAiFleet(registry,[valid],{ledgerAvailable:true});const row=p.entries[0];
 assert.equal(row.siteAiStatus,'unverified');assert.equal(row.siteAiRunningVerified,false);
 assert.equal(row.siteAiRegistrationVerified,false);assert.equal(row.lastImprovement.productionVerified,false);
 assert.equal(p.verifiedLiveAgentsAvailable,false);
});
test('private ledger fields stay outside public projection',()=>{
 const p=projectSiteAiFleet(registry,[valid],{ledgerAvailable:true});
 assert.ok(!JSON.stringify(p).includes('should_never_be_exposed'));
});
test('newest valid run wins and unknown run state is not inferred',()=>{
 const p=projectSiteAiFleet(registry,[{...valid,run_day:'2026-11-11',state:'completed'}, {...valid,state:'not_a_real_state'}],{ledgerAvailable:true});
 assert.equal(p.entries[0].lastImprovement.state,'unknown');
});
test('missing DB reports unavailable not running',async()=>{
 const p=await readSiteAiFleet({},registry);
 assert.equal(p.ledgerAvailable,false);assert.equal(p.entries[0].lastImprovement,null);
});
test('DB errors do not leak diagnostic secrets',async()=>{
 const p=await readSiteAiFleet({DB:{prepare(){throw new Error('secret credential')}}},registry);
 assert.equal(p.ledgerAvailable,false);assert.ok(!JSON.stringify(p).includes('credential'));
});
test('bounded query is strictly read-only',async()=>{
 let sql='';
 const env={DB:{prepare(s){sql=s;return {all:async()=>({results:[valid]})}}}};
 const p=await readSiteAiFleet(env,registry);
 assert.match(sql,/SELECT site_id/);assert.doesNotMatch(sql,/(INSERT|UPDATE|DELETE)/i);
 assert.match(sql,/LIMIT 100/);assert.equal(p.entries[0].lastImprovement.pr,9333);
});
test('invalid evidence date, task id and commit are discarded',()=>{
 const p=projectSiteAiFleet(registry,[{...valid,run_day:'invalid'}, {...valid,task_id:'../../admin',merge_sha:'invalid',run_day:'2026-11-12'}],{ledgerAvailable:true});
 assert.equal(p.entries[0].lastImprovement.mergeSha,null);
 assert.equal(p.entries[0].lastImprovement.taskRef,'');
});
