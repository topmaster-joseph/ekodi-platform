import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { summarizeAutomationForSites, joinSiteIndexNowSubmissions } from '../search-visibility-control.js';
import {
  tenantAutomationOverviewModel,
  tenantAutomationOverviewHtml,
  TENANT_AUTOMATION_CSS,
} from '../tenant-automation-overview-ui.js';

const read = path => readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Central site aggregate is explicit, sanitized, and does not fabricate missing measurements',()=>{
  const rows=summarizeAutomationForSites({
    catalog:[
      {id:'mall',name:'에코디몰',kind:'site',basePath:'/ekodimall',channelAdminSection:'channel-settings',channelSubjectKey:'ekodimall'},
      {id:'books',name:'에코디서점',kind:'site',basePath:'/books'},
      {id:'internal',name:'private control',kind:'service',basePath:'/admin',channelSubjectKey:'internal'}
    ],
    sources:{connections:'ready',jobs:'ready',policies:'unavailable'},
    connections:[{subject_key:'ekodimall',total:4,active:3,token_ciphertext:'secret'}],
    jobs:[{subject_key:'ekodimall',published:6,failed:1,pending:2,last_published_at:'2026-11-02T02:00:00Z',caption:'private'}],
    policies:[{subject_key:'ekodimall',autonomous:1}],
  });
  assert.equal(rows.length,2);
  assert.deepEqual(rows.map(x=>x.id),['mall','books']);
  assert.equal(rows[0].activeChannels,3);
  assert.equal(rows[0].publishedTotal,6);
  assert.equal(rows[0].failedJobs,1);
  assert.equal(rows[0].pendingJobs,2);
  assert.equal(rows[0].autonomousPolicy,null);
  assert.equal(rows[0].adminPath,'/ekodimall/admin/channel-settings');
  assert.equal(rows[1].scope,'not_integrated');
  assert.equal(rows[1].activeChannels,null);
  assert.equal(rows[1].publishedTotal,null);
  assert.equal(rows[1].adminPath,'');
  assert.doesNotMatch(JSON.stringify(rows),/secret|private|token_ciphertext|caption|subjectKey/);
});

test('Unavailable site telemetry is unknown, and observed empty counts are zero',()=>{
  const empty=tenantAutomationOverviewModel();
  assert.equal(empty.activeChannels,null);
  assert.equal(empty.published,null);
  const observed=tenantAutomationOverviewModel({
    connectionsLoaded:true,publishingLoaded:true,jobsLoaded:true,
    connections:[],publishChannels:[],jobs:[],
  });
  assert.equal(observed.activeChannels,0);
  assert.equal(observed.published,0);
  assert.equal(observed.failed,0);
  assert.equal(observed.lastPublished,null);
  assert.match(tenantAutomationOverviewHtml(empty),/미연동/);
  assert.match(tenantAutomationOverviewHtml(observed),/기록 없음/);
});

test('Local site tabs use only supplied tenant data and do not execute writes',()=>{
  const model=tenantAutomationOverviewModel({
    connectionsLoaded:true,publishingLoaded:true,jobsLoaded:true,
    connections:[{status:'active',provider:'youtube',external_id:'private-id'}],
    publishChannels:[{status:'active',config:{autoPublishEnabled:true}}],
    jobs:[
      {status:'published',published_at:'2026-11-01T01:00:00Z'},
      {status:'failed',last_error:'private error'},
      {status:'scheduled'},
    ],
    growthOverview:{ok:true,subject:{type:'tenant',key:'ekodimall'},campaigns:{total:2,awaitingApproval:1,failed:0}},
    service:'mall',adminBase:'/ekodimall/admin',
  });
  assert.equal(model.activeChannels,1);
  assert.equal(model.automaticChannels,1);
  assert.equal(model.published,1);
  assert.equal(model.failed,1);
  assert.equal(model.pending,1);
  assert.equal(model.campaign.total,2);
  const html=tenantAutomationOverviewHtml(model);
  for(const label of ['검색노출','AI 추천','홍보','자동게시','성과','오류·조치'])assert.ok(html.includes(label));
  assert.match(html,/aria-selected="true"/);
  assert.match(html,/\/ekodimall\/admin\/analytics/);
  assert.doesNotMatch(html,/private-id|private error|campaigns.*secret/i);
  assert.doesNotMatch(html,/<form|type="submit"/);
  assert.match(TENANT_AUTOMATION_CSS,/@media\(max-width:620px\)/);
});

test('Authority and UI reuse are protected by the existing platform/tenant gate',()=>{
  const control=read('search-visibility-control.js');
  const central=read('growth-os-admin.js');
  const site=read('workspace-admin-page.js');
  assert.ok(control.indexOf('const actor=await superAdmin') < control.indexOf('siteAutomationSnapshot(env.DB)'));
  assert.match(control,/if\(!actor\)return denied\(403,'SUPER_ADMIN_REQUIRED'\)/);
  assert.match(central,/api\('\/api\/control\/search-visibility',token\(\)\)/);
  assert.match(central,/성공.*누적/);
  assert.match(site,/tenantAutomationOverviewModel\(\{connections,publishChannels,jobs,connectionsLoaded:/);
  assert.match(site,/bindTenantAutomationOverview\(\$\('tenantAutoOverview'\)\)/);
  assert.match(site,/service&&service!=='mall'\?Promise\.resolve\(null\):growth/);
  assert.doesNotMatch(control,/token_ciphertext.*SELECT|SELECT.*token_ciphertext/);
});

test('Super-admin IndexNow site joins use canonical public paths and never infer actual indexing',()=>{
  const catalog=[
    {id:'mall',name:'에코디몰',kind:'site',basePath:'/ekodimall',channelSubjectKey:'ekodimall'},
    {id:'cgma',name:'청계면상인회',kind:'site',basePath:'/cgma',channelSubjectKey:'cgma'},
    {id:'private',name:'비공개 사이트',kind:'site',basePath:'/unpublished',channelSubjectKey:'private'},
  ];
  const rows=summarizeAutomationForSites({catalog,sources:{connections:'ready',jobs:'ready',policies:'ready'},policies:[{subject_key:'ekodimall',autonomous:0}]});
  assert.equal(rows[0].autonomousPolicy,false,'recorded review policy is a real false state');
  assert.equal(rows[1].autonomousPolicy,null,'missing policy is unknown, never a fabricated review setting');
  const source={
    status:'naver_submission_only',truncated:false,
    sites:[
      {siteUrl:'https://ekodi.kr/ekodimall/',submittedPagesInSnapshot:12,lastSubmittedAt:'2026-11-03T05:02:00Z'},
      {siteUrl:'https://ekodi.kr/cgma',submittedPagesInSnapshot:0,lastSubmittedAt:null},
      {siteUrl:'https://other.example/unpublished',submittedPagesInSnapshot:41,lastSubmittedAt:'2026-11-03T05:00:00Z'},
      {siteUrl:'https://ekodi.kr/unpublished?token=secret',submittedPagesInSnapshot:99},
    ],
  };
  const joined=joinSiteIndexNowSubmissions({status:'ready',sources:{jobs:'ready'},sites:rows},source);
  assert.equal(joined.status,'ready');
  assert.equal(joined.sources.indexNow,'ready');
  assert.equal(joined.sites[0].indexNowSubmittedPages,12);
  assert.equal(joined.sites[0].lastIndexNowSubmittedAt,'2026-11-03T05:02:00Z');
  assert.equal(joined.sites[1].indexNowSubmittedPages,0,'an observed 0 from complete sample remains 0');
  assert.equal(joined.sites[2].indexNowSubmittedPages,null,'non-public foreign-host or query evidence is not matched');
  assert.doesNotMatch(JSON.stringify(joined),/secret|other\.example/);
  const truncated=joinSiteIndexNowSubmissions({status:'ready',sites:rows},{...source,truncated:true});
  assert.equal(truncated.status,'partial');
  assert.equal(truncated.sources.indexNow,'truncated');
  assert.equal(truncated.sites[0].indexNowSubmittedPages,12,'positive sample counts are documented minima');
  assert.equal(truncated.sites[1].indexNowSubmittedPages,null,'truncated sample 0 cannot prove no historical submission');
  assert.equal(truncated.sites[0].indexNowSampleTruncated,true);
  const missing=joinSiteIndexNowSubmissions({status:'ready',sites:rows},{status:'unavailable',sites:[]});
  assert.equal(missing.status,'partial');
  assert.equal(missing.sources.indexNow,'unavailable');
  assert.ok(missing.sites.every(site=>site.indexNowSubmittedPages===null));
});

test('Central Growth OS visibly separates Naver submission receipts from search indexing',()=>{
  const source=read('growth-os-admin.js');
  const control=read('search-visibility-control.js');
  const css=read('growth-os-admin.css');
  assert.match(source,/IndexNow 제출/);
  assert.match(source,/IndexNow 제출 접수/);
  assert.match(source,/실제 색인이 아닙니다/);
  assert.match(source,/item\.indexNowSubmittedPages/);
  assert.match(css,/growth-os-automation-scroll/);
  assert.match(control,/joinSiteIndexNowSubmissions\(automation,indexNow\)/);
  assert.match(control,/if\(!actor\)return denied\(403,'SUPER_ADMIN_REQUIRED'\)/);
});
