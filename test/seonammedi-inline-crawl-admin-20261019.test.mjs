import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Owner request (2026-10-19): EKODI refreshes 활동이력·관련소식 by periodic web
// search, administrators register in the same format directly on the public
// page, and the admin console no longer carries 관련소식·활동이력·소통채널.

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const fn=(js,name)=>{const start=js.indexOf('function '+name+'(');assert.ok(start>=0,name);let depth=0,i=js.indexOf('){',start)+1;for(;i<js.length;i++){if(js[i]==='{')depth++;else if(js[i]==='}'&&--depth===0)break}return js.slice(start,i+1)};

test('both menus offer link registration that reuses the verified link-import API',async()=>{
  const [html,js,api]=await Promise.all([read('sites/seonammedi/public/index.html'),read('sites/seonammedi/public/app.js'),read('seonammedi-admin-control.js')]);
  for(const prefix of ['timeline','committee'])
    for(const id of ['LinkToggle','LinkForm','LinkUrl','LinkPreviewButton','LinkSaveButton','LinkPreview','LinkMessage'])
      assert.match(html,new RegExp('id="'+prefix+id+'"'),prefix+id);
  assert.match(html,/id="committeeLinkToggle"[^>]*hidden/,'hidden until administrator authorization');
  const generic=fn(js,'bindInlineLinkImport');
  assert.match(generic,/\/api\/seonammedi\/admin\/timeline\/link-preview/);
  assert.match(generic,/\/api\/seonammedi\/admin\/timeline\/link-import[\s\S]*committeeRelated:committee/);
  assert.match(js,/if\(admin\.has\('timeline'\)\)bindCommitteeLinkImport\(\)/);
  assert.match(api,/body\?\.committeeRelated===true\?1:0/);
});

test('web-search candidates are reviewed on the public page with text-only rendering',async()=>{
  const [html,js]=await Promise.all([read('sites/seonammedi/public/index.html'),read('sites/seonammedi/public/app.js')]);
  for(const id of ['timelineReviewPanel','timelineReviewList','committeeReviewPanel','committeeReviewList'])assert.match(html,new RegExp('id="'+id+'"[^>]*'));
  assert.match(html,/id="timelineReviewPanel"[^>]*hidden/);
  const load=fn(js,'loadMonitorReview');
  assert.match(load,/\/api\/seonammedi\/admin\/content/);
  assert.match(load,/reviewState==='candidate'/);
  const row=fn(js,'reviewRow');
  assert.match(row,/textContent=item\.title/);
  assert.doesNotMatch(row,/innerHTML/);
  assert.match(row,/rel='noopener noreferrer'/);
  assert.match(fn(js,'renderMonitorReview'),/state:publishing\?'published':'rejected'/);
  assert.match(js,/if\(admin\.has\('content'\)\)loadMonitorReview\(\)/);
});

test('administrators can trigger the EKODI web search immediately',async()=>{
  const [html,js]=await Promise.all([read('sites/seonammedi/public/index.html'),read('sites/seonammedi/public/app.js')]);
  assert.match(html,/id="timelineMonitorRun"[^>]*hidden[^>]*data-monitor-run="timelineReviewMessage"/);
  assert.match(html,/id="committeeMonitorRun"[^>]*hidden[^>]*data-monitor-run="committeeReviewMessage"/);
  assert.match(fn(js,'bindMonitorRunNow'),/\/api\/seonammedi\/admin\/monitor\/run',\{method:'POST'\}/);
  assert.match(js,/if\(admin\.has\('content'\)\|\|admin\.has\('pages'\)\)bindMonitorRunNow\(\)/);
});

test('admin console no longer carries 관련소식·활동이력·소통채널',async()=>{
  const [adminHtml,adminJs]=await Promise.all([read('sites/seonammedi/public/admin/index.html'),read('sites/seonammedi/public/admin/admin.js')]);
  for(const marker of ['data-panel="status"','data-panel="channels"','id="timelineForm"','id="channelForm"','id="contentList"','id="adminTimelineLinkForm"','id="timelineCount"','id="channelCount"','id="contentCount"','href="../#committee-activity"','href="../#timeline"','href="../#channels"'])
    assert.ok(!adminHtml.includes(marker),marker);
  for(const marker of ['loadTimeline','loadContent','loadChannels','loadStatusPage','bindAdminTimelineLinkImport',"$('timelineForm')","$('channelForm')"])
    assert.ok(!adminJs.includes(marker),marker);
  for(const kept of ['data-panel="organization"','data-panel="finance"','data-panel="minutes"','data-panel="access"','id="adminRoster"'])assert.ok(adminHtml.includes(kept),kept);
});
