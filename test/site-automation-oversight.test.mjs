import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { summarizeAutomationForSites } from '../search-visibility-control.js';
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
