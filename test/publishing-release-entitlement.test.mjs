import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {activePaidAuthorPlan,verifyCommercialRelease,verifyPublishingSubmission} from '../publishing/release-entitlement.js';
const UUID='00000000-0000-4000-8000-000000000101';
const DIGEST='a'.repeat(64),SECRET='test_subscription_reader_secret_abcdefghijklmnopqrstuvwxyz0123456789';
const at=new Date('2026-11-01T01:00:00Z');
function sqlite(){
 const db=new DatabaseSync(':memory:');
 db.exec(readFileSync(new URL('../migrations/202610291000_publishing_workflow.sql',import.meta.url),'utf8'));
 const prepare=(sql,args=[])=>({bind(...a){return prepare(sql,a)},async first(){return db.prepare(sql).get(...args)||null}});
 const id='11111111-1111-4111-8111-111111111111';
 db.prepare("INSERT INTO publishing_workflow_projects (id,author_user_id,title,field_id,edition_id,created_at,updated_at,release_digest) VALUES (?,?,?,'literature','v1',?,?,?)")
   .run(id,UUID,'작품','2026-10-29T00:00:00Z','2026-10-29T00:00:00Z',DIGEST);
 return {db,id,env:{PUBLISH_DB:{prepare}}};
}
function signed(db,id,flags={}){
 db.prepare("INSERT INTO publishing_workflow_release_contracts (project_id,author_user_id,edition_digest,status,author_signed_at,publisher_signed_at,royalty_terms_accepted,commission_terms_accepted,distribution_license_accepted,sealed_contract_sha256,created_at,updated_at) VALUES (?,?,?,'signed',?,?, ?,?,?, ?,?,?)")
 .run(id,UUID,DIGEST,'2026-10-29T00:00:00Z','2026-10-29T00:00:00Z',
  flags.royalty??1,flags.commission??1,flags.distribution??1,'b'.repeat(64),'2026-10-29T00:00:00Z','2026-10-29T00:00:00Z');
 db.prepare("INSERT INTO publishing_workflow_audio_release_qa (project_id,edition_digest,stage,master_sha256,voice_license_verified,dialogue_qa_passed,full_track_qa_passed,buyer_access_verified,refund_revoke_verified,bonus_price_krw,verified_by,verified_at) VALUES (?,?,'approved',?,1,1,1,1,1,0,?,?)")
 .run(id,DIGEST,'c'.repeat(64),'audio-editor','2026-10-29T00:00:00Z');
}
const oldFetch=globalThis.fetch;
test.after(()=>{globalThis.fetch=oldFetch});
test('free and nonconfigured subscriptions cannot start commercial sale',async()=>{
 const {env,id}=sqlite();
 assert.equal((await verifyCommercialRelease(env,{id,authorUserId:UUID,releaseDigest:DIGEST},at)).ready,false);
 assert.equal((await activePaidAuthorPlan(env,UUID,at)).reason,'MEMBERSHIP_READ_NOT_CONFIGURED');
});
test('verified paid plan must be unexpired, status active and payment recorded',async()=>{
 const env={PUBLISH_SUBSCRIPTION_READ_KEY:SECRET};
 globalThis.fetch=async()=>new Response(JSON.stringify([{
  plan_id:'writer1',status:'active',verified_payment_at:'2026-10-25T00:00:00Z',
  paid_until:'2026-11-30T00:00:00Z'
 }]));
 const active=await activePaidAuthorPlan(env,UUID,at);assert.equal(active.active,true);
 assert.equal(active.planId,'writer1');
 globalThis.fetch=async()=>new Response(JSON.stringify([{
  plan_id:'writer3',status:'cancelled',verified_payment_at:'2026-10-25T00:00:00Z',
  paid_until:'2026-11-30T00:00:00Z'
 }]));
 assert.equal((await activePaidAuthorPlan(env,UUID,at)).active,false);
 globalThis.fetch=async()=>new Response(JSON.stringify([{
  plan_id:'writer1',status:'active',verified_payment_at:null,paid_until:'2026-11-30T00:00:00Z'
 }]));
 assert.equal((await activePaidAuthorPlan(env,UUID,at)).active,false);
});
test('paid writer requires separately signed royalty contract and zero-priced, quality-approved audio',async()=>{
 const {db,id,env}=sqlite();env.PUBLISH_SUBSCRIPTION_READ_KEY=SECRET;
 globalThis.fetch=async()=>new Response(JSON.stringify([{
  plan_id:'writer1',status:'active',verified_payment_at:'2026-10-25T00:00:00Z',paid_until:'2026-11-30T00:00:00Z'
 }]));
 const project={id,authorUserId:UUID,releaseDigest:DIGEST};
 signed(db,id);
 assert.equal((await verifyCommercialRelease(env,project,at)).ready,true);
 db.prepare('UPDATE publishing_workflow_release_contracts SET commission_terms_accepted=0 WHERE project_id=?').run(id);
 assert.equal((await verifyCommercialRelease(env,project,at)).reason,'SEPARATE_SIGNED_PUBLISHING_CONTRACT_REQUIRED');
 db.prepare('UPDATE publishing_workflow_release_contracts SET commission_terms_accepted=1 WHERE project_id=?').run(id);
 db.prepare('UPDATE publishing_workflow_audio_release_qa SET buyer_access_verified=0 WHERE project_id=?').run(id);
 assert.equal((await verifyCommercialRelease(env,project,at)).reason,'FREE_PREMIUM_AUDIOBOOK_QA_REQUIRED');
 db.prepare('UPDATE publishing_workflow_audio_release_qa SET buyer_access_verified=1, bonus_price_krw=0 WHERE project_id=?').run(id);
 assert.equal((await verifyCommercialRelease(env,{...project,releaseDigest:'d'.repeat(64)},at)).ready,false);
});
test('chief requires two independent server controls plus publisher copyright license and audio QA',async()=>{
 const {db,id,env}=sqlite();
 signed(db,id,{royalty:0,commission:0});
 env.PUBLISH_CHIEF_AUTHOR_IDS=UUID;
 const project={id,authorUserId:UUID,releaseDigest:DIGEST};
 assert.equal((await verifyCommercialRelease(env,project,at)).ready,false);
 db.prepare("INSERT INTO publishing_workflow_roles (user_id,role,granted_by,granted_at) VALUES (?,'admin','bootstrap',?)")
   .run(UUID,at.toISOString());
 assert.equal((await verifyCommercialRelease(env,project,at)).ready,true);
 db.prepare("UPDATE publishing_workflow_release_contracts SET distribution_license_accepted=0 WHERE project_id=?").run(id);
 assert.equal((await verifyCommercialRelease(env,project,at)).ready,false);
});

test('free publication submission cannot be forged by request body or bypass an expired subscription',async()=>{
  const {db,id,env}=sqlite();
  const project={id,authorUserId:UUID,releaseDigest:DIGEST};
  assert.equal((await verifyPublishingSubmission(env,project,at)).ready,false);
  env.PUBLISH_SUBSCRIPTION_READ_KEY=SECRET;
  globalThis.fetch=async()=>new Response(JSON.stringify([{
    plan_id:'writer1',status:'active',verified_payment_at:'2026-10-25T00:00:00Z',
    paid_until:'2026-10-29T00:00:00Z'
  }]));
  assert.equal((await verifyPublishingSubmission(env,project,at)).ready,false);
  globalThis.fetch=async()=>new Response(JSON.stringify([{
    plan_id:'writer1',status:'active',verified_payment_at:'2026-10-25T00:00:00Z',
    paid_until:'2026-11-30T00:00:00Z'
  }]));
  assert.equal((await verifyPublishingSubmission(env,project,at)).ready,true);
  env.PUBLISH_CHIEF_AUTHOR_IDS=UUID;env.PUBLISH_SUBSCRIPTION_READ_KEY='';
  assert.equal((await verifyPublishingSubmission(env,project,at)).ready,false);
  db.prepare("INSERT INTO publishing_workflow_roles (user_id,role,granted_by,granted_at) VALUES (?,'admin','bootstrap',?)")
    .run(UUID,at.toISOString());
  assert.equal((await verifyPublishingSubmission(env,project,at)).ready,true);
});
