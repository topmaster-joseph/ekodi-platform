import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(path,import.meta.url),'utf8');
const tabPanels={apply:'apply',flow:'flowPanel',status:'statusPanel',contract:'contractPanel',guide:'guidePanel'};

test('premium customer layout exposes one accessible tab per real content panel',async()=>{
  const html=await read('../ekodibiz/ai-agency.html');
  assert.match(html,/role="tablist" aria-label="AI 구독 위탁 서비스 메뉴"/);
  assert.match(html,/class="agency-hero"/);
  assert.match(html,/class="layout agency-workspace"/);
  for(const [view,id] of Object.entries(tabPanels)){
    assert.match(html,new RegExp('role="tab"[^>]+aria-controls="'+id+'"[^>]+data-agency-tab="'+view+'"'));
    assert.match(html,new RegExp('id="'+id+'" role="tabpanel"[^>]+data-agency-panel="'+view+'"'));
  }
  assert.equal((html.match(/id="message"/g)||[]).length,1);
  assert.equal((html.match(/id="lookupToken"/g)||[]).length,1);
  assert.equal((html.match(/id="campusPanel"/g)||[]).length,1);
  assert.equal((html.match(/id="tossPanel"/g)||[]).length,1);
  assert.match(html,/id="campusCycleDetails"/);
  assert.match(html,/id="cycleOverview"/);
  assert.match(html,/<details class="cycle-details"/);
  assert.match(html,/@media\(max-width:760px\)/);
  assert.match(html,/@media\(max-width:440px\)/);
  assert.doesNotMatch(html,/2건 전체 신청|홍길동|010-1234-5678|02-1234-5678/);
});

test('tab behavior stays keyboard accessible without replacing secure receipt and provider payment states',async()=>{
  const js=await read('../ekodibiz/ai-agency.js');
  for(const term of ["ArrowRight","ArrowLeft","'Home'","'End'","'aria-selected'","tabIndex","tabPanels","activateTab('status')","activateTab('contract')"]){
    assert.ok(js.includes(term),term);
  }
  assert.match(js,/const visible=tabButtons\.filter\(item=>!item\.hidden\)/);
  assert.match(js,/panel\.hidden=panel\.dataset\.agencyPanel!==target/);
  assert.match(js,/cycleOverview'\)\.textContent/);
  assert.match(js,/contractEmpty'\)\.hidden=!!campusReport/);
  assert.match(js,/campusPanel'\)\.hidden = true/);
  assert.match(js,/receipt\.id!==queried\.id\|\|receipt\.receiptToken!==queried\.receiptToken/);
  assert.match(js,/months:Number\(form\.elements\.months\.value\)/);
  assert.doesNotMatch(js,/innerHTML\s*=/);
  assert.doesNotMatch(js,/localStorage\.setItem\(/);
});

test('months still require explicit user input and financial access is honest',async()=>{
  const html=await read('../ekodibiz/ai-agency.html');
  assert.match(html,/name="months" type="number" min="1" max="120" step="1" required/);
  assert.doesNotMatch(html,/name="months"[^>]*value="/);
  assert.match(html,/조회번호와 보안코드/);
  assert.match(html,/공급사의 수납·재판매 허용 조건이 확인된 건에만/);
  assert.match(html,/에코디비즈 위탁관리 계약은 자동으로 갱신되지 않습니다/);
  assert.match(html,/공급사 비밀번호·카드번호·OTP·AI 대화기록을 받지 않으며/);
  assert.doesNotMatch(html,/미리 동의됨|승인 완료 1건|실결제 준비 완료/);
});

test('premium company admin is a real tabbed view without exposing private access',async()=>{
  const [html,js]=await Promise.all([
    read('../ekodibiz/ai-agency-admin.html'),read('../ekodibiz/ai-agency-admin.js')
  ]);
  const tabs={list:'adminApplications',review:'detail',settlement:'opsDetail'};
  assert.match(html,/role="tablist" aria-label="업체 관리자 세부 메뉴"/);
  for(const [name,id] of Object.entries(tabs)){
    assert.match(html,new RegExp('role="tab"[^>]+aria-controls="'+id+'"[^>]+data-admin-tab="'+name+'"'));
    assert.match(html,new RegExp('id="'+id+'" role="tabpanel"[^>]+data-admin-panel="'+name+'"'));
  }
  assert.match(js,/showAdminTab\('review'\)/);
  assert.match(js,/showAdminTab\('list'\)/);
  assert.match(js,/if\(target!=='list'&&!selected\)return/);
  assert.match(js,/adminTabs\.forEach|for\(const tab of adminTabs\)/);
  assert.match(js,/x-ekodibiz-agency-admin/);
  assert.doesNotMatch(js,/localStorage\.setItem\(/);
  assert.doesNotMatch(js,/sessionStorage\.setItem\(/);
  assert.match(html,/input,textarea,select\{width:100%/);
});

test('narrow phone layout keeps all tabs visible and stacks long contract choice labels',async()=>{
  const html=await read('../ekodibiz/ai-agency.html');
  assert.match(html,/@media\(max-width:440px\)\{/);
  assert.match(html,/\.agency-tabs\{display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\);overflow:visible/);
  assert.match(html,/#agencyForm \.choice\{grid-template-columns:1fr\}/);
  assert.doesNotMatch(html,/@media\(max-width:390px\)\{[^}]*overflow-x:auto/);
});

test('company administrator share buttons keep light background and dark readable text',async()=>{
  const html=await read('../ekodibiz/ai-agency-admin.html');
  assert.match(html,/data-share-agency="current"/);
  assert.match(html,/data-share-agency="university"/);
  assert.match(html,/\.agency-navigation button\[data-share-agency\]\{background:#eef6f0;color:#184b36/);
  assert.match(html,/\.agency-navigation button\[data-share-agency\]:hover\{background:#dfeee4;color:#123d2c/);
  assert.match(html,/button:not\(\[role="tab"\]\)\{border-color:#1b6040;background:#1b6040\}/);
});
