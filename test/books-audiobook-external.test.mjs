import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { submitAudioClaim, approveAudioClaim, revokeAudioClaim, rejectAudioClaim, listMyClaims } from '../books-audiobook-external.js';

const file=readFileSync(new URL('../migrations/202610290200_books_audiobook_external_claims.sql',import.meta.url),'utf8');
const db=new DatabaseSync(':memory:');db.exec(file);
const stmt=(sql,args=[])=>({
  bind:(...a)=>stmt(sql,a),
  first:async()=>db.prepare(sql).get(...args)??null,
  all:async()=>({results:db.prepare(sql).all(...args)}),
  run:async()=>db.prepare(sql).run(...args)
});
const env={
  DB:{prepare:sql=>stmt(sql),batch:async list=>{db.exec('BEGIN');try{for(const a of list)await a.run();db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}}},
  ASSETS:{fetch:async()=>new Response(JSON.stringify({books:[
    {id:'BOOK-EKODI-000001',bonusAudio:{included:true,published:false}}
  ]}))},
  OPERATOR_EMAILS:'op@example.com',
  AUDIOBOOK_PURCHASE_PROOF_HMAC_KEY:'this-test-secret-is-longer-than-32-characters',
};
const original=globalThis.fetch;
const ident={id:'buyer-id',email:'reader@example.com',email_confirmed_at:'2026-10-29T00:00:00Z'};
const oper={...ident,id:'operator-id',email:'op@example.com'};
const make=(token,body)=>new Request('https://x/api/commerce/audiobook/claims',{
  method:body?'POST':'GET',headers:{authorization:'Bearer '+token,'content-type':'application/json'},
  body:body?JSON.stringify(body):undefined
});
test.beforeEach(()=>{
  db.exec('DELETE FROM books_audiobook_external_grants; DELETE FROM books_audiobook_external_claims;');
  globalThis.fetch=async(_,options)=>new Response(JSON.stringify(
    String(options?.headers?.authorization||'').includes('operator')?oper:ident));
});
test.afterEach(()=>{globalThis.fetch=original});
test('external claims do not issue rights without provider review',async()=>{
  const body={bookId:'BOOK-EKODI-000001',retailer:'upaper',orderNumber:'PURCHASE-20261029-ABC',consent:true};
  const response=await submitAudioClaim(env,make('buyer',body));
  assert.equal(response.status,202);
  const claim=await response.json();
  const row=db.prepare('SELECT * FROM books_audiobook_external_claims WHERE id=?').get(claim.claimId);
  assert.equal(row.status,'pending');
  assert.notEqual(row.external_order_hmac,body.orderNumber);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM books_audiobook_external_grants').get().n,0);
  assert.equal((await listMyClaims(env,make('buyer'))).status,200);
  assert.equal((await submitAudioClaim(env,make('buyer',body))).status,409,'same external order cannot be claimed twice');
  assert.equal((await approveAudioClaim(env,make('buyer',{orderNumber:body.orderNumber,confirmedWithRetailer:true,buyerIdentityMatched:true,refundStatusChecked:true,productEditionMatched:true,verificationMethod:'retailer_portal'}),claim.claimId)).status,403,'buyer cannot approve own order');
  assert.equal((await approveAudioClaim(env,make('operator',{orderNumber:'WRONG-ORDER',confirmedWithRetailer:true,buyerIdentityMatched:true,refundStatusChecked:true,productEditionMatched:true,verificationMethod:'retailer_portal'}),claim.claimId)).status,409);
  const approved=await approveAudioClaim(env,make('operator',{orderNumber:body.orderNumber,confirmedWithRetailer:true,buyerIdentityMatched:true,refundStatusChecked:true,productEditionMatched:true,verificationMethod:'retailer_portal'}),claim.claimId);
  assert.equal(approved.status,200);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM books_audiobook_external_grants WHERE revoked_at IS NULL').get().n,1);
  assert.equal((await revokeAudioClaim(env,make('buyer',{confirm:true,reason:'refund'}),claim.claimId)).status,403);
  assert.equal((await revokeAudioClaim(env,make('operator',{confirm:true,reason:'refund'}),claim.claimId)).status,200);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM books_audiobook_external_grants WHERE revoked_at IS NULL').get().n,0);
  const second=await submitAudioClaim(env,make('buyer',{...body,orderNumber:'PURCHASE-20261029-DEF'}));
  assert.equal(second.status,202);
  const next=await second.json();
  const again=await approveAudioClaim(env,make('operator',{
    orderNumber:'PURCHASE-20261029-DEF',confirmedWithRetailer:true,buyerIdentityMatched:true,
    refundStatusChecked:true,productEditionMatched:true,verificationMethod:'retailer_portal'
  }),next.claimId);
  assert.equal(again.status,200,'a newly verified purchase may restore a previously revoked audio-only grant');
  const grant=db.prepare("SELECT claim_id,revoked_at FROM books_audiobook_external_grants WHERE buyer_user_id='buyer-id'").get();
  assert.equal(grant.claim_id,next.claimId);
  assert.equal(grant.revoked_at,null);
});
test('claim without consent or a known retailer is rejected',async()=>{
  assert.equal((await submitAudioClaim(env,make('buyer',{bookId:'BOOK-EKODI-000001',retailer:'unknown',orderNumber:'ABC-12345',consent:true}))).status,400);
  assert.equal((await submitAudioClaim(env,make('buyer',{bookId:'BOOK-EKODI-000001',retailer:'upaper',orderNumber:'ABC-12345',consent:false}))).status,400);
});

test('operator can reject unverifiable orders without issuing any new access',async()=>{
  const request=await submitAudioClaim(env,make('buyer',{bookId:'BOOK-EKODI-000001',retailer:'google-play',
    orderNumber:'GOOGLE-ORDER-12345',consent:true}));
  assert.equal(request.status,202);
  const claim=await request.json();
  const rejected=await rejectAudioClaim(env,make('operator',{confirm:true,reason:'identity_mismatch'}),claim.claimId);
  assert.equal(rejected.status,200);
  const row=db.prepare('SELECT status,rejection_reason FROM books_audiobook_external_claims WHERE id=?').get(claim.claimId);
  assert.equal(row.status,'rejected');assert.equal(row.rejection_reason,'identity_mismatch');
  assert.equal((await approveAudioClaim(env,make('operator',{orderNumber:'GOOGLE-ORDER-12345',
    confirmedWithRetailer:true,buyerIdentityMatched:true,refundStatusChecked:true,productEditionMatched:true,
    verificationMethod:'retailer_portal'}),claim.claimId)).status,409);
});
test('approval cannot skip proof of purchaser identity or refund status',async()=>{
  const r=await submitAudioClaim(env,make('buyer',{bookId:'BOOK-EKODI-000001',retailer:'amazon',
    orderNumber:'AMAZON-ORDER-12345',consent:true}));
  const claim=await r.json();
  assert.equal((await approveAudioClaim(env,make('operator',{orderNumber:'AMAZON-ORDER-12345',
    confirmedWithRetailer:true,verificationMethod:'retailer_portal'}),claim.claimId)).status,400);
});
