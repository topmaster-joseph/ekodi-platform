import test from 'node:test';
import assert from 'node:assert/strict';
import { Script } from 'node:vm';
import { readFileSync } from 'node:fs';
import { storeAdminScript, storeAdminCss, storeAdminPage } from '../store-admin-engine.js';
import { tenantAutomationOverviewModel, tenantAutomationOverviewHtml } from '../tenant-automation-overview-ui.js';

const source=readFileSync(new URL('../store-admin-engine.js',import.meta.url),'utf8');
const storeNames=[
  {slug:'jadam',name:'자담치킨 목포대점'},
  {slug:'pizzamaru',name:'피자마루 목포대점'},
  {slug:'yogurt',name:'요거트퍼플 목포대점'},
];

test('Every first-store admin serves the same six-tab store-native channel center',async()=>{
  const script=await storeAdminScript();
  assert.equal(script.status,200);
  const js=await script.text();
  assert.doesNotThrow(()=>new Script(js),'the real store-admin.js payload must be valid classic JavaScript');
  for(const name of ['tenantAutoOverview','OVERVIEW_MODEL','OVERVIEW_HTML','OVERVIEW_BIND','ownedAutopostStatus']){
    assert.ok(js.includes(name),`missing shared store readiness integration: ${name}`);
  }
  assert.match(js,/subjectKey:SLUG,service:'store'/);
  assert.match(js,/connectionsLoaded:settled\[2\]\.status==='fulfilled'/);
  assert.match(js,/publishingLoaded:settled\[3\]\.status==='fulfilled'/);
  assert.match(js,/jobsLoaded:settled\[3\]\.status==='fulfilled'/);
  assert.match(js,/id="storeRecentJobs"/);
  for(const store of storeNames){
    const response=storeAdminPage({...store,mark:'ST',brand:'STORE',pathname:`/${store.slug}/admin/publishing`});
    const html=await response.text();
    assert.equal(response.status,200);
    assert.match(html,/data-ekodi-store-site-admin="true"/);
    assert.match(html,/src="\/store-admin\.js/);
  }
});

test('Store-native CSS contains all six summary tabs and responsive disclosure',async()=>{
  const response=storeAdminCss();
  assert.equal(response.status,200);
  const css=await response.text();
  assert.match(css,/tenant-auto-overview/);
  assert.match(css,/tenant-auto-readiness/);
  assert.match(css,/tenant-auto-tabs/);
  assert.match(css,/@media\(max-width:620px\)/);
  assert.match(source,/CSS\+tenantAdminMetricsTabsCss\+TENANT_AUTOMATION_CSS/);
  assert.match(source,/tenantAutomationOverviewModel\.toString\(\)/);
  assert.match(source,/tenantAutomationOverviewHtml\.toString\(\)/);
  assert.match(source,/bindTenantAutomationOverview\.toString\(\)/);
});

test('Store statuses are tenant-scope evidence while local channel controls retain store scope',()=>{
  const health={ok:true,subjects:[
    {subjectType:'tenant',subjectKey:'jadam',state:'channel_required',activeChannels:0,usableChannels:0,eligibleContent:0,pendingJobs:0,policyMode:'autonomous',secret:'not-for-browser'},
    {subjectType:'tenant',subjectKey:'yogurt',state:'ready',activeChannels:1,usableChannels:1,eligibleContent:5,pendingJobs:0,policyMode:'autonomous',secret:'other-store-private'},
  ]};
  for(const slug of ['jadam','pizzamaru','yogurt']){
    const m=tenantAutomationOverviewModel({
      service:'store',subjectKey:slug,ownedAutopostStatus:health,
      connectionsLoaded:true,publishingLoaded:true,jobsLoaded:true,
      connections:[],publishChannels:[],jobs:[],
    });
    assert.equal(m.store,true);
    const html=tenantAutomationOverviewHtml(m);
    assert.match(html,/검색노출/);
    assert.match(html,/AI 추천/);
    assert.match(html,/홍보/);
    assert.match(html,/자동게시/);
    assert.match(html,/성과/);
    assert.match(html,/오류·조치/);
    assert.match(html,/통합 자동게시\(tenant\)/);
    assert.match(html,/점포 운영\(store\)/);
    assert.doesNotMatch(html,/not-for-browser|other-store-private/);
    if(slug==='jadam'){
      assert.equal(m.autopost.state,'channel_required');
      assert.match(html,/href="#storeChannelAccounts"/);
      assert.match(html,/이것만으로 통합 자동게시 연결이 완료되지 않습니다/);
      assert.match(html,/승인된 자동게시 콘텐츠가 없습니다/);
    }else if(slug==='pizzamaru'){
      assert.equal(m.autopost,null,'a site without a health record must not inherit another store status');
      assert.doesNotMatch(html,/발행 조건 충족/);
    }else{
      assert.equal(m.autopost.state,'ready');
      assert.match(html,/실제 발행과 방문·매출 성과는 별도로 검증/);
    }
  }
  assert.match(source,/subject_type=store&subject_key=/,'existing store identity boundary must not be silently rewritten');
  assert.match(source,/subjectKey:SLUG,service:'store'/);
  assert.doesNotMatch(source,/subject_type=tenant&subject_key=\$\{encodeURIComponent\(STORE_ID\)\}/);
});
