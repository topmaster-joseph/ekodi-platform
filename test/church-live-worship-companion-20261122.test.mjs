import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {tenantLivePage} from '../tenant-live-page.js';
import {churchLiveCss} from '../tenant-live-church-shell.js';

const js=readFileSync(new URL('../tenant-live.js',import.meta.url),'utf8');
const make=(path,apiTenant)=>({path,apiTenant,mode:'worship',name:'Test',title:'Test Live',home:'/',authSite:'church'});
const responseBody=async tenant=>(await tenantLivePage(tenant)).text();

test('canonical Church uses actual two-pane LIVE order/PPT + A/V layout, other tenants do not',async()=>{
  const html=await responseBody(make('/live/church/','ekodichurch'));
  for(const id of ['churchLiveGuide','churchGuideOrder','churchGuideSlides','churchGuideCount','churchGuideFollow','churchHostGuide','churchHostPrev','churchHostNext','viewerVideo','participantCameraPreview']){
    assert.match(html,new RegExp('id="'+id+'"'),id);
  }
  assert.ok(html.indexOf('id="churchLiveGuide"')<html.indexOf('class="stage viewer-stage"'));
  assert.match(html,/data-church-view="split"/);
  assert.match(html,/data-church-view="video"/);
  assert.match(html,/data-church-view="guide"/);
  assert.match(html,/v=20261122-worship-companion/);
  for(const tenant of [make('/live/biz/','ekodibiz'),make('/ekodichurch/live/','ekodichurch')]){
    const other=await responseBody(tenant);
    assert.doesNotMatch(other,/id="churchLiveGuide"|id="churchHostGuide"/);
  }
});

test('church-only split layout preserves embedded video-only public viewer',async()=>{
  const response=churchLiveCss(),css=await response.text();
  assert.match(css,/#viewerView\.viewer\{grid-template-columns:minmax\(0,1fr\) minmax\(0,1\.12fr\)/);
  assert.match(css,/grid-template-areas:"guide stage" "guide controls"/);
  assert.match(css,/html\[data-church-live-inline="true"\] #viewerView>\.church-live-guide\{display:none!important\}/);
  assert.match(css,/@media\(max-width:900px\)/);
  assert.match(css,/data-church-view="guide"/);
  assert.match(css,/data-church-view="video"/);
});

test('church guide reads only official public materials and validates schema and date',()=>{
  assert.match(js,/document\.body\?\.dataset\.tenant!=='ekodichurch'/);
  assert.match(js,/location\.pathname!=='\/live\/church\/'/);
  assert.match(js,/\/ekodichurch\/worship\/weekly\.json/);
  assert.match(js,/\/materials\.json/);
  assert.match(js,/ekodi\.worship\.materials\.v1/);
  assert.match(js,/packet\.site!=='ekodichurch'/);
  assert.match(js,/slides\.length>120/);
  assert.match(js,/textContent=String\(row\)/);
  assert.doesNotMatch(js,/churchGuideOrderList.*innerHTML/);
});

test('authorized presenter sends cursor; viewer can read without broadcast token',()=>{
  assert.match(js,/verifyHostAccess\(\)/);
  assert.match(js,/role:'host'/);
  assert.match(js,/role:'viewer'/);
  assert.match(js,/role!=='host'\|\|!room\|\|!deck/);
  assert.match(js,/method:'PUT'.*authorization:'Bearer '/);
  assert.match(js,/method:'PUT'.*JSON\.stringify\(\{deckId:deck,index:next\}\)/);
  assert.match(js,/credentials:'omit',headers/);
  assert.match(js,/status\(\'서버 요청 제한으로/);
  assert.match(js,/if\(document\.visibilityState==='visible'&&role==='viewer'\)/);
  assert.match(js,/clearInterval\(poll\)/);
  assert.match(js,/ekodi:live:room-ended/);
});

test('church viewer changes presentation locally without sending a host write',()=>{
  const start=js.indexOf('async function move(delta,asHost)');
  const end=js.indexOf('async function readCursor()',start);
  assert.ok(start>0&&end>start);
  const segment=js.slice(start,end);
  const local=segment.slice(segment.indexOf('if(!asHost)'),segment.indexOf('if(role!=='));
  assert.match(local,/following=false/);
  assert.doesNotMatch(local,/fetch\(|method:'PUT'/);
});
