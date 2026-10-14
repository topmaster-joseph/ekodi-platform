import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {assistanceCatalogue,assistanceSelection,normalizeAssistanceRequest} from '../support/assistance-catalog.js';
const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=read('ai-control/commons.html'),css=read('ai-control/commons.css'),client=read('ai-control/commons.js'),worker=read('ai-control-worker.js');
const input={noticeId:'B-123',noticeTitle:'인공지능 기술 검증',noticeSource:'bizinfo',noticeUrl:'https://www.bizinfo.go.kr/notices/123',
  planIds:['eligibility','document'],applicantName:'김지원',organization:'',scopeAcknowledged:true,privacyAcknowledged:true,precontractAcknowledged:true};
test('default catalog exposes scope and quote-required cost without fabricated approved prices',()=>{
  const plans=assistanceCatalogue();
  assert.equal(plans.length,6);
  assert.equal(plans.find(p=>p.id==='information').price.amount,0);
  for(const plan of plans.filter(p=>!p.free)){
    assert.equal(plan.price.amount,null);
    assert.equal(plan.price.kind,'quote_required');
    assert.ok(plan.deliverables.length>0);
    assert.ok(plan.limitations.includes('보장')||plan.limitations.length>10);
  }
  assert.equal(assistanceSelection(['eligibility'],plans).quoteRequired,true);
});
test('only merchant-approved integer KRW prices are publishable',()=>{
  const prices={eligibility:{amount:250000,currency:'KRW',vatIncluded:true,policyVersion:'approved-2026-v1'},document:{amount:420000,currency:'KRW',vatIncluded:false,policyVersion:'approved-2026-v1'}};
  const cfg={EKODIBIZ_ASSISTANCE_PRICES_JSON:JSON.stringify(prices)};
  assert.equal(assistanceCatalogue(cfg).find(p=>p.id==='eligibility').price.amount,null);
  cfg.EKODIBIZ_ASSISTANCE_PRICES_APPROVED='true';
  let plans=assistanceCatalogue(cfg);
  assert.equal(assistanceSelection(['eligibility','document'],plans).amount,670000);
  assert.equal(plans.find(p=>p.id==='eligibility').price.vatIncluded,true);
  cfg.EKODIBIZ_ASSISTANCE_PRICES_JSON=JSON.stringify({...prices,document:{...prices.document,amount:-2}});
  assert.equal(assistanceCatalogue(cfg).find(p=>p.id==='document').price.amount,null);
});
test('review requests ignore client prices and enforce explicit consents and official HTTPS',()=>{
  const result=normalizeAssistanceRequest({...input,amount:1,merchant:'untrusted'});
  assert.equal(result.selected.amount,null);
  assert.equal(result.state,'review_requested');
  assert.equal(result.merchant,'EKODIBIZ');
  assert.equal(result.legalVersion,'opportunity-assistance-request-v1');
  assert.throws(()=>normalizeAssistanceRequest({...input,scopeAcknowledged:false}),/consent_required/);
  assert.throws(()=>normalizeAssistanceRequest({...input,noticeUrl:'http://www.bizinfo.go.kr'}),/official_notice_required/);
  assert.throws(()=>normalizeAssistanceRequest({...input,noticeUrl:'https://evil:pass@www.bizinfo.go.kr'}),/official_notice_required/);
  assert.throws(()=>normalizeAssistanceRequest({...input,planIds:['document','document']}),/duplicate_plan/);
  assert.throws(()=>normalizeAssistanceRequest({...input,planIds:['unknown']}),/invalid_plan/);
});
test('detail page and guided request are connected to existing official feed and login',()=>{
  assert.match(html,/id="support-detail"/);
  assert.match(html,/id="assistanceRequestForm"/);
  assert.match(html,/id="assistanceContractText"/);
  assert.match(html,/id="assistancePriceSummary"/);
  assert.match(client,/supportNoticeKey/);
  assert.match(client,/new URL\(location.href\)\.searchParams\.get\('support_notice'\)/);
  assert.match(client,/openSupportDetail\(item,true\)/);
  assert.match(client,/api\('\/api\/commons\/assistance\/catalog'\)/);
  assert.match(client,/api\('\/api\/commons\/assistance\/requests'/);
  assert.match(client,/!state.session/);
  assert.match(client,/textContent=String\(item.summary\)/);
  assert.match(css,/@media\(max-width:720px\)/);
});
test('server owns prices and owner scope; payment and contract acceptance have no public mutation route',()=>{
  assert.match(worker,/normalizeAssistanceRequest\(input\|\|\{\},catalog\)/);
  assert.match(worker,/await requireCommonsMember\(request,env\)/);
  assert.match(worker,/WHERE user_id=\?/);
  assert.match(worker,/agreementExecuted:false/);
  assert.match(worker,/paymentInitiated:false/);
  assert.match(worker,/state:'review_requested'/);
  assert.doesNotMatch(worker,/\/api\/commons\/assistance\/payments\/confirm/);
  const migration=read('migrations/0130_ai_assistance_requests.sql');
  assert.match(migration,/user_id TEXT NOT NULL/);
  assert.match(migration,/merchant TEXT NOT NULL DEFAULT 'EKODIBIZ'/);
  assert.match(migration,/quote_required/);
});
