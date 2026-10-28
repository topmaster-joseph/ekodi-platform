import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { submitAudioClaim, approveAudioClaim, revokeAudioClaim, listMyClaims } from '../books-audiobook-external.js';

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
  assert.equal((await approveAudioClaim(env,make('buyer',{orderNumber:body.orderNumber,confirmedWithRetailer:true,verificationMethod:'retailer_portal'}),claim.claimId)).status,403,'buyer cannot approve own order');
  assert.equal((await approveAudioClaim(env,make('operator',{orderNumber:'WRONG-ORDER',confirmedWithRetailer:true,verificationMethod:'retailer_portal'}),claim.claimId)).status,409);
  const approved=await approveAudioClaim(env,make('operator',{orderNumber:body.orderNumber,confirmedWithRetailer:true,verificationMethod:'retailer_portal'}),claim.claimId);
  assert.equal(approved.status,200);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM books_audiobook_external_grants WHERE revoked_at IS NULL').get().n,1);
  assert.equal((await revokeAudioClaim(env,make('buyer',{confirm:true,reason:'refund'}),claim.claimId)).status,403);
  assert.equal((await revokeAudioClaim(env,make('operator',{confirm:true,reason:'refund'}),claim.claimId)).status,200);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM books_audiobook_external_grants WHERE revoked_at IS NULL').get().n,0);
});
test('claim without consent or a known retailer is rejected',async()=>{
  assert.equal((await submitAudioClaim(env,make('buyer',{bookId:'BOOK-EKODI-000001',retailer:'unknown',orderNumber:'ABC-12345',consent:true}))).status,400);
  assert.equal((await submitAudioClaim(env,make('buyer',{bookId:'BOOK-EKODI-000001',retailer:'upaper',orderNumber:'ABC-12345',consent:false}))).status,400);
});
