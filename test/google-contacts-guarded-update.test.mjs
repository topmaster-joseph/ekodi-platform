import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepareNameCorrection} from '../google-contacts-change-plan.js';
import {correctionDigest,executeApprovedCorrection} from '../google-contacts-guarded-update.js';
const ctx={ownerId:'owner-A',googleSubject:'subject-A',operationId:'op-A',resourceName:'people/c1'};
const person=()=>({resourceName:'people/c1',metadata:{sources:[{type:'CONTACT',id:'1',etag:'v1'}]},names:[{displayName:'홍길동.목포대',unstructuredName:'홍길동.목포대'}],phoneNumbers:[{value:'01012345678'}],biographies:[{value:'synthetic note'}]});
async function setup(){
  let current=person(),saved,consumed=false;const calls=[],statuses=[];const plan=prepareNameCorrection(current),approved=await correctionDigest(ctx,plan),key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  const repository={claimApproval:async request=>{if(consumed||request.digest!==approved)return{claimed:false};consumed=true;return{claimed:true,leaseId:'lease-A'}},saveBackup:async(_lease,_ctx,e)=>{calls.push('save');saved=e},readBackup:async()=>{calls.push('restore');return saved},finishOperation:async(_lease,r)=>statuses.push(r.status)};
  const args={actor:{userId:ctx.ownerId},ctx,plan,repository,resolveConnection:async()=>({ownerId:ctx.ownerId,googleSubject:ctx.googleSubject,scopes:['https://www.googleapis.com/auth/contacts'],accessToken:'fake-token'}),resolveBackupKey:async()=>({keyId:'key-A',key}),fetchImpl:async(url,init)=>{
    if(url.includes('openidconnect.googleapis.com'))return Response.json({sub:ctx.googleSubject});
    const u=new URL(url);assert.equal(u.origin,'https://people.googleapis.com');assert.equal(u.searchParams.get('sources'),'READ_SOURCE_TYPE_CONTACT');
    if(init.method==='PATCH'){calls.push('patch');assert.equal(u.searchParams.get('updatePersonFields'),'names,organizations');const body=JSON.parse(init.body);current={...current,names:body.names,organizations:body.organizations,metadata:{sources:[{type:'CONTACT',id:'1',etag:'v2'}]}};return Response.json(current)}
    calls.push('get');return Response.json(current);
  }};
  return {args,calls,statuses,change:f=>f(current)};
}
test('backup persisted and verified before one narrow write; independently reread',async()=>{const f=await setup();assert.equal((await executeApprovedCorrection(f.args)).status,'verified');assert.deepEqual(f.calls,['get','save','restore','patch','get']);assert.deepEqual(f.statuses,['verified']);await assert.rejects(executeApprovedCorrection(f.args),{code:'APPROVAL_OR_LEASE_REQUIRED'});assert.equal(f.calls.filter(x=>x==='patch').length,1)});
test('cross owner rejected without requests',async()=>{const f=await setup();f.args.actor.userId='other';await assert.rejects(executeApprovedCorrection(f.args),{code:'OWNER_REQUIRED'});assert.deepEqual(f.calls,[])});
test('read-only grant cannot write',async()=>{const f=await setup();f.args.resolveConnection=async()=>({ownerId:ctx.ownerId,googleSubject:ctx.googleSubject,scopes:['https://www.googleapis.com/auth/contacts.readonly'],accessToken:'fake-token'});await assert.rejects(executeApprovedCorrection(f.args),{code:'GOOGLE_WRITE_CONSENT_REQUIRED'});assert.deepEqual(f.calls,[])});
test('wrong Google subject rejected',async()=>{const f=await setup();f.args.fetchImpl=async()=>Response.json({sub:'other'});await assert.rejects(executeApprovedCorrection(f.args),{code:'GOOGLE_ACCOUNT_MISMATCH'})});
test('modified plan not approved',async()=>{const f=await setup();f.args.plan.body.organizations[0].name='other';await assert.rejects(executeApprovedCorrection(f.args),{code:'APPROVAL_OR_LEASE_REQUIRED'});assert.deepEqual(f.calls,[])});
test('stale etag blocked before write',async()=>{const f=await setup();f.change(p=>p.metadata.sources[0].etag='new');assert.equal((await executeApprovedCorrection(f.args)).status,'blocked_before_write');assert.deepEqual(f.calls,['get'])});
test('missing persisted backup blocked before write',async()=>{const f=await setup();f.args.repository.readBackup=async()=>null;assert.equal((await executeApprovedCorrection(f.args)).status,'blocked_before_write');assert(!f.calls.includes('patch'))});
test('ambiguous patch failure requires reconciliation and no retry',async()=>{const f=await setup();const prev=f.args.fetchImpl;let count=0;f.args.fetchImpl=async(url,init)=>{if(init.method==='PATCH'){count++;throw Error('network')}return prev(url,init)};assert.equal((await executeApprovedCorrection(f.args)).status,'needs_reconciliation');assert.equal(count,1);assert.deepEqual(f.statuses,['needs_reconciliation'])});
test('other fields changed after patch requires reconciliation',async()=>{const f=await setup();const prev=f.args.fetchImpl;f.args.fetchImpl=async(url,init)=>{const r=await prev(url,init);if(init.method==='PATCH')f.change(p=>p.phoneNumbers=[]);return r};assert.equal((await executeApprovedCorrection(f.args)).status,'needs_reconciliation')});
