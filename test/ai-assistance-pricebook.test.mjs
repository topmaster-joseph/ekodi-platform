import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ASSISTANCE_PLANS,assistanceCatalogue} from '../support/assistance-catalog.js';
import {approveAssistancePricebook,catalogFromApprovedPricebook} from '../support/assistance-pricebook.js';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const input={
  policyVersion:'ekodibiz-2026-10-v1',merchantApproved:true,
  publicDisclosureApproved:true,noGuaranteeAcknowledged:true,
  items:ASSISTANCE_PLANS.map(p=>({id:p.id,currency:'KRW',vatIncluded:true,
    amount:p.free?0:p.id==='eligibility'?275000:p.id==='document'?480000:null}))
};
test('only explicit authorized merchant consent can approve a new six-service pricebook',()=>{
  const approved=approveAssistancePricebook(input);
  assert.equal(approved.items.length,6);
  assert.equal(approved.items.find(p=>p.id==='information').amount,0);
  assert.equal(approved.items.find(p=>p.id==='eligibility').amount,275000);
  assert.equal(approved.items.find(p=>p.id==='submission').amount,null);
  assert.equal(approved.merchant,'EKODIBIZ');
  assert.equal(approved.affiliatedWithIssuingAgency,false);
  for(const key of ['merchantApproved','publicDisclosureApproved','noGuaranteeAcknowledged']){
    assert.throws(()=>approveAssistancePricebook({...input,[key]:false}),/merchant_price_approval_required/);
  }
  assert.throws(()=>approveAssistancePricebook({...input,items:input.items.slice(1)}),/pricebook_items_required/);
  assert.throws(()=>approveAssistancePricebook({...input,items:input.items.map(p=>p.id==='information'?{...p,amount:300}:p)}),/information_must_remain_free/);
  assert.throws(()=>approveAssistancePricebook({...input,items:input.items.map(p=>p.id==='eligibility'?{...p,amount:-1}:p)}),/pricebook_amount_invalid/);
  assert.throws(()=>approveAssistancePricebook({...input,items:input.items.map(p=>p.id==='eligibility'?{...p,amount:'100'}:p)}),/pricebook_amount_invalid/);
  assert.throws(()=>approveAssistancePricebook({...input,items:input.items.map(p=>p.id==='document'?{...p,vatIncluded:false}:p)}),/pricebook_vat_krw_required/);
  assert.throws(()=>approveAssistancePricebook({...input,items:input.items.map(p=>({...p,amount:p.id==='information'?0:null}))}),/at_least_one_service_price_required/);
});
test('public prices are server-validated immutable merchant-approved snapshots, never browser totals',()=>{
  const payload=approveAssistancePricebook(input);
  const row={policy_version:payload.policyVersion,items_json:JSON.stringify(payload),status:'approved'};
  const catalog=catalogFromApprovedPricebook({},row);
  assert.equal(catalog.length,6);
  assert.equal(catalog.find(p=>p.id==='eligibility').price.amount,275000);
  assert.equal(catalog.find(p=>p.id==='eligibility').price.vatIncluded,true);
  assert.equal(catalog.find(p=>p.id==='document').price.policyVersion,'ekodibiz-2026-10-v1');
  assert.equal(catalog.find(p=>p.id==='submission').price.kind,'quote_required');
  assert.equal(catalog.find(p=>p.id==='information').price.kind,'free');
  const bogus={...row,policy_version:'wrong_version'};
  assert.equal(catalogFromApprovedPricebook({},bogus).find(p=>p.id==='eligibility').price.kind,'quote_required');
  const revoked={...row,status:'void'};
  assert.equal(catalogFromApprovedPricebook({},revoked).find(p=>p.id==='eligibility').price.amount,null);
  assert.equal(assistanceCatalogue().find(p=>p.id==='eligibility').price.amount,null);
});
test('admin page and server enforce merchant-only approval and immutable D1 tariffs while PG remains disabled',()=>{
  const worker=read('ai-control-worker.js'),ui=read('ai-control/commons.js'),html=read('ai-control/commons.html');
  const migration=read('migrations/0133_ai_assistance_pricebooks.sql');
  assert.match(worker,/merchant_quote_role_required/);
  assert.match(worker,/EKODIBIZ_ASSISTANCE_QUOTE_APPROVERS/);
  assert.match(worker,/approveAssistancePricebook/);
  assert.match(worker,/catalogFromApprovedPricebook/);
  assert.match(worker,/checkoutEnabled:false/);
  assert.match(html,/id="assistancePricebookForm"/);
  assert.match(html,/id="assistancePriceApproved"/);
  assert.match(html,/id="assistancePriceNoGuarantee"/);
  assert.match(ui,/loadAssistancePricebook/);
  assert.match(ui,/\/api\/commons\/admin\/assistance\/pricebook/);
  assert.match(migration,/ai_assistance_pricebooks_no_update/);
  assert.match(migration,/ai_assistance_pricebooks_no_delete/);
  assert.doesNotMatch(worker,/\/api\/commons\/assistance\/payments\/confirm/);
});
