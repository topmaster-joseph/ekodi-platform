import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../assets/supplier-discovery.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../assets/supplier-discovery-layout.css',import.meta.url),'utf8');
const js=readFileSync(new URL('../assets/supplier-discovery.js',import.meta.url),'utf8');

test('all five supplier discovery steps render as one accessible panel',()=>{
  const names=['candidate','score','evidence','outreach','preflight'];
  for(const [index,name] of names.entries()){
    assert.ok(html.includes('id="discovery-tab-'+name+'"'),name);
    assert.ok(html.includes('id="discovery-panel-'+name+'" role="tabpanel"'),name);
    assert.match(html,new RegExp('data-discovery-panel="'+name+'"'+(index?' hidden':'')));
  }
  assert.match(html,/role="tablist"/);
  assert.match(js,/function showTab\(value,updateUrl=false\)/);
  assert.match(js,/new URLSearchParams\(location\.search\)\.get\('tab'\)/);
  assert.match(css,/\.discovery-page \.discovery-panels \.ops-panel\[hidden\]\{display:none!important\}/);
  assert.match(css,/@media\(max-width:540px\)/);
});

test('signed-out actions and stored assessment details are hidden from an unauthorized viewer',()=>{
  assert.match(html,/id="discoveryLogin" class="btn primary">운영자 로그인<\/button>/);
  assert.match(html,/id="discoveryLogout" class="smallbtn" hidden>로그아웃<\/button>/);
  assert.match(css,/#discoveryLogout\[hidden\]/);
  assert.match(js,/const signed=Boolean\(session\),canEdit=signed&&discoveryAuthorized/);
  assert.match(js,/el.disabled=!canEdit/);
  assert.match(js,/discoveryAuthorized=true;context=r.context/);
  assert.match(js,/revision!==accessRevision/);
  assert.match(js,/session.user\?\.id!==actor/);
  assert.match(js,/context=blankContext\(\);selectedCandidateId=''/);
  assert.match(js,/\$\('#assessmentForm'\)\?\.reset\(\)/);
  assert.match(js,/\+\+accessRevision;discoveryAuthorized=false;session=null;sync\(\)/);
});

test('no automatic outreach, payments, PII, or order permissions are opened',()=>{
  for(const id of ['discoveryStatus','discoverySummary','candidateCreateForm','assessmentForm','evidenceForm','evidenceReviewForm','outreachDraftForm','outreachStatusForm','preflightForm','preflightResult','candidateRows'])assert.ok(html.includes('id="'+id+'"'),id);
  for(const path of ['/api/internal/supplier-discovery/context','/api/internal/supplier-candidates','/api/internal/supplier-preflight'])assert.ok(js.includes(path),path);
  assert.match(js,/자동 발송하지 않습니다/);
  assert.match(html,/자동발주/);
  assert.match(js,/https:\/\/ekodi\.kr\/auth\//);
  assert.match(js,/return_to/);
});
