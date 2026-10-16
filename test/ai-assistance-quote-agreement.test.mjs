import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  merchantContractReadiness,normalizeMerchantQuote,quoteDigest,
  normalizeQuoteAcknowledgment,paymentReadiness,ASSISTANCE_CONTRACT_VERSION
} from '../support/assistance-contract.js';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const source=read('ai-control-worker.js'),client=read('ai-control/commons.js'),html=read('ai-control/commons.html'),css=read('ai-control/commons.css');
const env={
  EKODIBIZ_LEGAL_NAME:'주식회사 에코디비즈',EKODIBIZ_REPRESENTATIVE:'대표자',
  EKODIBIZ_BUSINESS_NUMBER:'123-45-67890',EKODIBIZ_BUSINESS_ADDRESS:'주소 확인 완료',EKODIBIZ_CUSTOMER_SERVICE:'support@example.com',
  EKODIBIZ_ASSISTANCE_TERMS_URL:'https://ekodi.kr/ekodibiz/terms',
  EKODIBIZ_ASSISTANCE_REFUND_URL:'https://ekodi.kr/ekodibiz/refund',
  EKODIBIZ_PRIVACY_POLICY_URL:'https://ekodi.kr/privacy',
  EKODIBIZ_ASSISTANCE_TERMS_VERSION:'policy-2026-01',EKODIBIZ_ASSISTANCE_CONTRACT_APPROVED:'true',
  EKODIBIZ_ASSISTANCE_RETENTION_DAYS:'90'
};
const chosen=[{id:'eligibility'},{id:'document'},{id:'information'}];
const stamp='2026-10-15T00:00:00.000Z',expiresAt='2026-10-20T00:00:00.000Z';
const originalRequest={id:'63a9da02-e289-46a8-85d5-41595958039d',notice_id:'official-123',notice_title:'공식 AI 공고',applicant_name:'홍길동',organization:'신청기관'};
const quote={lineItems:[{id:'eligibility',amount:300000},{id:'document',amount:500000},{id:'information',amount:0}],
  vatIncluded:true,deliveryDays:14,expiresAt,notes:'문서수정 2회 포함'};
test('merchant quote is closed until verified legal identity, policy, and retention are explicitly approved',()=>{
  assert.equal(merchantContractReadiness().ready,false);
  assert.equal(merchantContractReadiness({...env,EKODIBIZ_ASSISTANCE_CONTRACT_APPROVED:'false'}).ready,false);
  assert.ok(merchantContractReadiness({...env,EKODIBIZ_ASSISTANCE_RETENTION_DAYS:'0'}).blockers.includes('privacy_retention_policy_missing'));
  assert.equal(merchantContractReadiness(env).ready,true);
  assert.throws(()=>normalizeMerchantQuote(quote,chosen,{},stamp,originalRequest),/merchant_contract_configuration_required/);
});
test('merchant-priced snapshot cannot overcharge free tier or trust forged totals, duplicate plans and VAT exclusions',()=>{
  const accepted=normalizeMerchantQuote({...quote,totalAmount:1},chosen,env,stamp,originalRequest);
  assert.equal(accepted.totalAmount,800000);
  assert.equal(accepted.items.length,3);
  assert.equal(accepted.currency,'KRW');assert.equal(accepted.vatIncluded,true);
  assert.equal(accepted.contractVersion,ASSISTANCE_CONTRACT_VERSION);
  assert.equal(accepted.request.noticeTitle,'공식 AI 공고');assert.equal(accepted.request.applicantName,'홍길동');
  assert.equal(accepted.documents.retentionDays,90);
  assert.throws(()=>normalizeMerchantQuote({...quote,lineItems:[{id:'eligibility',amount:1},{id:'document',amount:2},{id:'information',amount:10}]},chosen,env,stamp,originalRequest),/invalid_quote_amount/);
  assert.throws(()=>normalizeMerchantQuote({...quote,vatIncluded:false},chosen,env,stamp,originalRequest),/vat_policy_requires_total_included/);
  assert.throws(()=>normalizeMerchantQuote({...quote,deliveryDays:0},chosen,env,stamp,originalRequest),/delivery_days_invalid/);
  assert.throws(()=>normalizeMerchantQuote({...quote,expiresAt:'2027-01-01T00:00:00.000Z'},chosen,env,stamp,originalRequest),/quote_expiry_invalid/);
  assert.throws(()=>normalizeMerchantQuote({...quote,lineItems:[...quote.lineItems,{id:'document',amount:500000}]},chosen,env,stamp,originalRequest),/line_items_incomplete/);
});
test('customer review requires same identity, unexpired server snapshot and full explicit acknowledgments',async()=>{
  const snapshot=normalizeMerchantQuote(quote,chosen,env,stamp,originalRequest);
  const digest=await quoteDigest(snapshot);
  assert.match(digest,/^[a-f0-9]{64}$/);
  const serverRow={id:'quote-id',user_id:'owner',status:'issued',expires_at:expiresAt,digest,applicant_name:'홍길동'};
  const signed={typedName:'홍길동',digest,termsAccepted:true,refundAcknowledged:true,privacyAcknowledged:true,nonBindingAcknowledged:true};
  const review=normalizeQuoteAcknowledgment(signed,serverRow,'owner','owner',Date.parse(stamp));
  assert.equal(review.acknowledgmentType,'review_acknowledgment_not_e_signature');
  assert.throws(()=>normalizeQuoteAcknowledgment(signed,serverRow,'owner','attacker',Date.parse(stamp)),/quote_not_found/);
  assert.throws(()=>normalizeQuoteAcknowledgment({...signed,digest:'old'},serverRow,'owner','owner',Date.parse(stamp)),/quote_version_conflict/);
  assert.throws(()=>normalizeQuoteAcknowledgment({...signed,refundAcknowledged:false},serverRow,'owner','owner',Date.parse(stamp)),/contract_acknowledgment_required/);
  assert.throws(()=>normalizeQuoteAcknowledgment({...signed,typedName:'다른사람'},serverRow,'owner','owner',Date.parse(stamp)),/signer_name_mismatch/);
  assert.throws(()=>normalizeQuoteAcknowledgment(signed,serverRow,'owner','owner',Date.parse(expiresAt)+1),/quote_expired/);
  assert.throws(()=>normalizeQuoteAcknowledgment(signed,{...serverRow,status:'acknowledged'},'owner','owner',Date.parse(stamp)),/quote_not_open/);
});
test('payment never becomes enabled by contract preview or customer acknowledgment alone',()=>{
  const p=paymentReadiness();
  assert.equal(p.enabled,false);assert.equal(p.canMarkPaid,false);assert.equal(p.canStartWork,false);
  assert.equal(p.checkoutUrl,null);
  assert.ok(p.blockers.includes('certified_pg_server_confirmation_missing'));
  assert.match(source,/merchant_quote_role_required/);
  assert.match(source,/EKODIBIZ_ASSISTANCE_QUOTE_APPROVERS/);
  assert.match(source,/WHERE r.id=\? AND r.user_id=\?/);
  assert.match(source,/status='issued'/);
  assert.match(source,/status='acknowledged'/);
  assert.match(source,/env.DB.batch\(/);
  assert.doesNotMatch(source,/\/api\/commons\/assistance\/payments\/confirm/);
});
test('customer and merchant forms are integrated into existing per-notice page',()=>{
  for(const id of ['assistanceAdminPanel','assistanceMerchantQuoteForm','assistanceQuotePanel','assistanceAcknowledgmentForm','assistanceFinalRefundConsent','assistancePaymentReadiness'])assert.match(html,new RegExp('id="'+id+'"'));
  for(const marker of ['loadAssistanceAdmin','selectAssistanceAdminRequest','openAssistanceQuote','initAssistanceAgreement','assistanceFinalNonBindingConsent'])assert.ok(client.includes(marker),marker);
  assert.match(css,/assistance-merchant-lines/);
  assert.match(read('migrations/0131_ai_assistance_quotes.sql'),/request_id TEXT NOT NULL UNIQUE/);
  assert.match(read('migrations/0131_ai_assistance_quotes.sql'),/ai_assistance_events/);
});
