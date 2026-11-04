import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {recommendTenantServicePreset,renderTenantServiceAdmin} from '../tenant-service-admin-ui.js';
import {workspaceAdminScript} from '../workspace-admin-page.js';

const catalog=[
  {key:'members',label:'회원·운영진',readiness:'ready',menuVisible:true},
  {key:'events',label:'행사·신청',readiness:'ready',menuVisible:false},
  {key:'channels',label:'SNS 채널관리',readiness:'ready',menuVisible:false},
  {key:'posthistory',label:'게시이력·승인',readiness:'ready',menuVisible:false},
  {key:'accounting',label:'수입·지출·회계',readiness:'ready',menuVisible:true},
  {key:'documents',label:'문서·업무',readiness:'ready',menuVisible:false},
  {key:'analytics',label:'방문·운영통계',readiness:'ready',menuVisible:false},
  {key:'payments',label:'결제내역·정산',readiness:'ready',menuVisible:true},
  {key:'marketing',label:'홍보·마케팅',readiness:'ready',menuVisible:true},
  {key:'autopost',label:'예약·자동게시',readiness:'ready',menuVisible:true},
  {key:'mail',label:'이메일',readiness:'ready',menuVisible:true},
  {key:'live',label:'실시간 방송',readiness:'setup_required',menuVisible:true},
];

test('ministry preset suggests only currently-ready services without changing preferences',()=>{
  const before=JSON.stringify(catalog);
  const p=recommendTenantServicePreset('ekodichurch',catalog);
  assert.equal(p.label,'교회·선교 사역');
  assert.equal(p.readyCount,7);
  assert.equal(p.selectedCount,2);
  assert.deepEqual(p.missing.map(x=>x.key),['events','channels','posthistory','documents','analytics']);
  assert.equal(JSON.stringify(catalog),before);
  assert.deepEqual(recommendTenantServicePreset('ekodimission',catalog),p);
});

test('commercial, retail, association and research profiles are advisory, not entitlements',()=>{
  const mall=recommendTenantServicePreset('ekodimall',catalog);
  assert.equal(mall.profile,'mall');
  assert.deepEqual(mall.recommended.map(x=>x.key),['members','channels','analytics','payments','marketing','autopost']);
  const biz=recommendTenantServicePreset('ekodibiz',catalog);
  assert.equal(biz.profile,'business');
  assert.ok(biz.recommended.some(x=>x.key==='accounting'));
  const community=recommendTenantServicePreset('cgma',catalog);
  assert.equal(community.profile,'association');
  const lab=recommendTenantServicePreset('ekodilab',catalog);
  assert.equal(lab.profile,'research');
  assert.ok(lab.recommended.some(x=>x.key==='mail'));
  for(const p of [mall,biz,community,lab])assert.ok(p.recommended.every(x=>typeof x.selected==='boolean'));
});

test('unready or unregistered services are never recommended as enabled; unknown site remains neutral',()=>{
  const c=[{key:'events',readiness:'planned',menuVisible:true,label:'행사'},
           {key:'accounting',readiness:'setup_required',menuVisible:true,label:'회계'}];
  assert.equal(recommendTenantServicePreset('ekodichurch',c).readyCount,0);
  assert.equal(recommendTenantServicePreset('ekodibiz',c).readyCount,0);
  assert.equal(recommendTenantServicePreset('books',catalog),null);
  assert.equal(recommendTenantServicePreset('cmpmyi',catalog),null);
  assert.equal(recommendTenantServicePreset('jadam',catalog),null);
  assert.equal(recommendTenantServicePreset('ekodichurch',null),null);
  assert.equal(typeof renderTenantServiceAdmin,'function');
});

test('bundle passes the current site key to the existing settings screen, not a second admin',async()=>{
  const script=await workspaceAdminScript().text();
  assert.match(script,/renderTenantServiceAdmin\(\$\('mainPanel'\),\{siteKey:service==='mall'\?'ekodimall':workspace/);
  const summaryIdx=script.indexOf('const summarizeTenantServiceMenuProjection=');
  const presetIdx=script.indexOf('const recommendTenantServicePreset=');
  const renderIdx=script.indexOf('const renderTenantServiceAdmin=');
  assert.ok(summaryIdx>0&&presetIdx>summaryIdx&&renderIdx>presetIdx,'serialized browser helpers must precede UI renderer');
  assert.doesNotThrow(()=>new vm.Script(script),'generated browser script must parse');
  assert.match(script,/confirmTenantServicePreference/);
  assert.doesNotMatch(script,/localStorage\.setItem\(["']tenant_service_preference/);
});
