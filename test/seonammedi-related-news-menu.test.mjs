import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('committee history precedes related news, but original #timeline and #channels deep links still work',async()=>{
  const [html,js]=await Promise.all([read('sites/seonammedi/public/index.html'),read('sites/seonammedi/public/app.js')]);
  const committeeLink='href="#committee-activity" data-view-link="committee">활동이력</a>';
  const newsLink='href="#timeline" data-view-link="status">관련소식</a>';
  assert.ok(html.indexOf(committeeLink)>0&&html.indexOf(newsLink)>html.indexOf(committeeLink));
  assert.doesNotMatch(html,/<a href="#channels" data-view-link="channels">소통채널<\/a>/);
  assert.match(html,/id="committee-activity"[^>]*data-view-section="committee"/);
  assert.match(html,/id="timeline"[^>]*data-view-section="status"/);
  assert.match(html,/id="channels"[^>]*data-view-section="channels"/);
  assert.match(js,/committee:'committee-activity',status:'timeline'/);
  assert.match(js,/raw==='channels'\|\|raw\.startsWith\('channels\/'\)/);
  assert.match(js,/activateChannelPlatform\(found\?\.platform/);
});

test('news taxonomy replaces vague committee/history filters, exposes linked social channel names',async()=>{
  const [html,js]=await Promise.all([read('sites/seonammedi/public/index.html'),read('sites/seonammedi/public/app.js')]);
  assert.match(html,/id="relatedChannelLinks"/);
  assert.match(js,/function renderRelatedChannelLinks/);
  assert.match(js,/item\.name\|\|'연결 채널'/);
  for(const label of ['신문','잡지','방송','유튜브','블로그','대학','정부·공공기관','페이스북','인스타그램','틱톡'])assert.ok(js.includes("'"+label+"'"),'news source '+label);
  assert.doesNotMatch(js,/const TIMELINE_FILTERS=\[[^\]]*비대위 활동이력/);
  assert.match(js,/const relatedRows=publicTimelineEntries\.filter\(item=>!isCommitteeRecord\(item\)\)/);
  assert.match(js,/if\(isCommitteeRecord\(row\)\)return false/);
  assert.match(js,/renderRelatedChannelLinks\(\)/);
});

test('committee manager can search, filter, add, update, hide, delete, and reclassify legacy records with explicit scope',async()=>{
  const [html,js,adminHtml,adminJs,api]=await Promise.all([
    read('sites/seonammedi/public/index.html'),read('sites/seonammedi/public/app.js'),
    read('sites/seonammedi/public/admin/index.html'),read('sites/seonammedi/public/admin/admin.js'),
    read('seonammedi-admin-control.js')]);
  for(const id of ['committeeActivitySearch','committeeActivityFilters','committeeActivityList','committeeActivityForm','committeeActivityManageToggle'])assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(html,/id="committeeActivityManageToggle"[^>]*hidden/);
  assert.match(js,/if\(admin\.has\('timeline'\)\)bindCommitteeActivityAdmin\(\)/);
  assert.match(js,/recordScope:'committee'/);
  assert.match(js,/data-committee-edit/);assert.match(js,/data-committee-status/);assert.match(js,/data-committee-delete/);
  assert.match(html,/name="recordScope"/);assert.match(adminHtml,/name="recordScope"/);
  assert.match(adminJs,/recordScope:form\.elements\.recordScope\.value/);
  assert.match(api,/record_scope TEXT NOT NULL DEFAULT 'news'/);
  assert.match(api,/committee_kind TEXT NOT NULL DEFAULT ''/);
  assert.match(api,/recordScope:row\.record_scope==='committee'\|\|confirmedSeed\?'committee':'news'/);
  assert.match(api,/if\(!can\(auth,TIMELINE_CAP\)\)return json/);
  assert.match(api,/record_scope=\?,committee_kind=\?/);
  assert.match(api,/record_scope,committee_kind,status,sort_order/);
});

test('related news cannot silently claim committee acts based on search headlines or matching articles',async()=>{
  const [js,api,monitor]=await Promise.all([
    read('sites/seonammedi/public/app.js'),
    read('seonammedi-admin-control.js'),
    read('seonammedi-monitor.js')
  ]);
  assert.match(js,/const isCommitteeRecord=item=>item\?\.recordScope==='committee'/);
  assert.match(js,/if\(isCommitteeRecord\(row\)\)return false/);
  assert.match(api,/record_scope,committee_kind,status/);
  assert.match(api,/'news','',\?,0/);
  assert.match(monitor,/isPublicSeonamMediSource/);
});

test('only four unambiguous original committee actions are seeded to activity ledger',async()=>{
  const [api,raw]=await Promise.all([read('seonammedi-admin-control.js'),read('sites/seonammedi/public/data.json')]);
  const data=JSON.parse(raw);
  const verified=data.timeline.filter(item=>item.recordScope==='committee');
  assert.deepEqual(verified.map(item=>item.date),['2026.09.08','2026.09.09','2026.09.21','2026.09.22']);
  assert.match(api,/VERIFIED_COMMITTEE_SEEDS=Object\.freeze/);
  assert.match(api,/record_scope=\?,committee_kind=\?,status='published'/);
  assert.match(api,/row\.created_by==='system-seed'\?VERIFIED_COMMITTEE_SEEDS\[row\.legacy_key\]/);
  const studentOnly=data.timeline.find(item=>item.date==='2026.09.14');
  assert.notEqual(studentOnly?.recordScope,'committee');
  assert.ok(verified.every(item=>item.committeeKind));
});
