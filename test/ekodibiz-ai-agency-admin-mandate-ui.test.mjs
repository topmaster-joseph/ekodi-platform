import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=async(path)=>readFile(new URL(path,import.meta.url),'utf8');
test('existing EKODIBIZ admin page adds one compact variable-term evidence and settlement panel',async()=>{
  const html=await read('../ekodibiz/ai-agency-admin.html');
  for(const id of ['opsDetail','settlementSummary','cycleForm','recordCycleBtn','renewalForm','stopRenewalBtn','exportStatement']){
    assert.match(html,new RegExp('id="'+id+'"'));
  }
  assert.match(html,/실제 공급사에서 받은 영수증/);
  assert.match(html,/이 화면에서는 결제·구독해지·개인 계정 변경이 실행되지 않습니다/);
  assert.match(html,/input,textarea,select\{width:100%/);
  assert.match(html,/@media\(max-width:640px\)/);
  assert.doesNotMatch(html,/src="https:\/\/[^"]+\/ai-agency-admin/);
});
test('client settlement export escapes CSV formulas without storing operator key',async()=>{
  const js=await read('../ekodibiz/ai-agency-admin.js');
  assert.match(js,/const safeCell=value=>/);
  assert.match(js,/const clean=\/\^\[-=\+@\\t\\r\]/);
  assert.match(js,/\.replace\(\/"\/g,'""'\)/);
  assert.match(js,/text\/csv;charset=utf-8/);
  assert.match(js,/\/record-cycle/);
  assert.match(js,/\/stop-renewal/);
  assert.match(js,/\/settlement/);
  assert.doesNotMatch(js,/localStorage\.setItem\(['"]adminKey/);
  assert.doesNotMatch(js,/sessionStorage\.setItem\(['"]adminKey/);
});

test('one existing user-facing site hosts a private university summary without a new login provider',async()=>{
  const html=await read('../ekodibiz/ai-agency.html');
  const js=await read('../ekodibiz/ai-agency.js');
  for(const id of ['campusPanel','campusFee','campusBudget','campusSpent','campusRemaining',
    'campusCancellation','campusPeriods','campusExport','campusLimitation']){
    assert.match(html,new RegExp('id="'+id+'"'));
  }
  assert.match(html,/신청번호와 보안코드로 확인하는 계약별 조회 화면/);
  assert.match(js,/renderCampus\(data\.campus\)/);
  assert.match(js,/Number\.isSafeInteger\(report\.months\)/);
  assert.match(js,/campusPanel'\)\.hidden = true/);
  assert.match(js,/campusCsvValue/);
  assert.match(js,/\.textContent=/);
  assert.doesNotMatch(js,/innerHTML\s*=/);
  assert.match(js,/text\/csv;charset=utf-8/);
});

test('switching university receipt code clears old details and rejects stale lookup results',async()=>{
  const js=await read('../ekodibiz/ai-agency.js');
  assert.match(js,/current = null;\s*checkout = null;\s*widgets = null;/);
  assert.match(js,/\$\('result'\)\.hidden = true;/);
  assert.match(js,/receipt\.id!==queried\.id\|\|receipt\.receiptToken!==queried\.receiptToken/);
  assert.match(js,/\$\('result'\)\.hidden=true;\$\('campusPanel'\)\.hidden=true/);
});
test('university CSV formula injection guard handles whitespace prefix',async()=>{
  const js=await read('../ekodibiz/ai-agency.js');
  assert.match(js,/const safe=\/\^\\s\*\[=\+@-\]/);
  assert.match(js,/campusCsvValue/);
  assert.match(js,/\.replace\(\/"\/g,'""'\)/);
});

test('individual subpath always selects personal contract even after form restoration',async()=>{
  const js=await read('../ekodibiz/ai-agency.js');
  assert.match(js,/isIndividualRoute/);
  assert.match(js,/individual\.checked=true/);
  assert.match(js,/organizationGroup'\)\.hidden=true/);
  assert.match(js,/form\.elements\.organization\.required=false/);
  assert.match(js,/개인 AI 구독료 위탁신청/);
});


test('term is entered without preset and operator cycle options follow exact selected months',async()=>{
  const html=await read('../ekodibiz/ai-agency.html');
  const js=await read('../ekodibiz/ai-agency.js');
  const adminHtml=await read('../ekodibiz/ai-agency-admin.html');
  const adminJs=await read('../ekodibiz/ai-agency-admin.js');
  assert.match(html,/name="months" type="number" min="1" max="120" step="1" required/);
  assert.doesNotMatch(html,/name="months"[^>]*value="/);
  assert.match(js,/months:Number\(form\.elements\.months\.value\)/);
  assert.match(js,/record\.months\+'개월'/);
  assert.match(adminHtml,/<select name="cycle" required><\/select>/);
  assert.match(adminJs,/for\(let i=1;i<=x\.months;i\+\+\)/);
  assert.match(adminJs,/recorded\.has\(i\)/);
  for(const surface of [html,adminHtml]){
    assert.match(surface,/계약 담당자<\/a>/);
    assert.match(surface,/업체 관리자<\/a>/);
    assert.doesNotMatch(surface,/대학 계약조회<\/a>/);
    assert.doesNotMatch(surface,/운영자 관리<\/a>/);
  }
});
