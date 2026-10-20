import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

// Owner request (2026-10-19): 활동이력·관련소식 items get a share link that reopens
// the exact item, and administrators can sign in and manage them in place.

const read=path=>readFile(new URL('../sites/seonammedi/public/'+path,import.meta.url),'utf8');
const fn=(js,name)=>{const start=js.indexOf('function '+name+'(');assert.ok(start>=0,name);let depth=0,i=js.indexOf('{',start);for(;i<js.length;i++){if(js[i]==='{')depth++;else if(js[i]==='}'&&--depth===0)break}return js.slice(start,i+1)};

test('each item renderer emits a stable item key and a share button',async()=>{
  const js=await read('app.js');
  for(const [renderer,view] of [['renderPublicTimeline','timeline'],['renderCommitteeNews','committee'],['renderCommitteeActivity','committee']]){
    const body=fn(js,renderer);
    assert.match(body,/data-item-key="'\+escapeHtml\(itemShareKey\(item\)\)/,renderer);
    assert.ok(body.includes("itemShareButton(item,'"+view+"')"),renderer);
    assert.match(body,/openSharedItem\(\)/,renderer+' reopens a shared item after data arrives');
  }
});

test('share keys and URLs are stable, mount-aware and land on the right view',async()=>{
  const js=await read('app.js');
  const source=[fn(js,'itemShareKey'),fn(js,'siteMountBase'),fn(js,'itemShareUrl')].join('\n');
  for(const [origin,path,expected] of [
    ['https://seonammedi.kr','/','https://seonammedi.kr/?item=i42#committee-activity'],
    ['https://ekodi.kr','/seonammedi/','https://ekodi.kr/seonammedi/?item=i42#committee-activity']
  ]){
    const ctx={URL,location:{origin,pathname:path}};
    runInNewContext(source,ctx);
    assert.equal(ctx.itemShareKey({id:42}),'i42');
    assert.equal(ctx.itemShareKey({id:0,monitorSourceId:7}),'m7');
    const hashed=ctx.itemShareKey({date:'2026-10-01',title:'비대위 기자회견'});
    assert.match(hashed,/^h[0-9a-z]+$/);
    assert.equal(hashed,ctx.itemShareKey({date:'2026-10-01',title:'비대위 기자회견'}),'deterministic');
    assert.equal(ctx.itemShareUrl('i42','committee-activity'),expected);
  }
});

test('shared item opener only accepts well-formed keys and expands the visible card once',async()=>{
  const js=await read('app.js');
  const opener=fn(js,'openSharedItem');
  assert.match(opener,/\^\[imh\]\[0-9a-z\]\{1,24\}\$/);
  assert.match(opener,/!node\.closest\('\[hidden\]'\)/);
  assert.match(opener,/classList\.remove\('is-collapsed'\)/);
  assert.match(fn(js,'shareSiteItem'),/navigator\.share[\s\S]*navigator\.clipboard[\s\S]*window\.prompt/);
});

test('administrators can sign in from 활동이력 and 관련소식 and return to the same view',async()=>{
  const [html,js]=await Promise.all([read('index.html'),read('app.js')]);
  assert.match(html,/id="committee-activity"[\s\S]*?data-admin-login="committee-activity"[\s\S]*?id="committeeActivityFilters"/);
  // 2026-10-20 owner request: 관리자 로그인 / ＋ 추가 sit at the right end of the section title.
  assert.match(html,/id="timeline"[\s\S]*?id="timelineHeadActions"><button[^>]*data-admin-login="timeline"[\s\S]*?id="timelineFilters"/);
  const ctx={URL,location:{origin:'https://seonammedi.kr',pathname:'/'},ADMIN_LOGIN_VIEWS:['committee-activity','timeline']};
  runInNewContext(fn(js,'siteMountBase')+fn(js,'adminLoginUrl'),ctx);
  const url=new URL(ctx.adminLoginUrl('committee-activity'));
  assert.equal(url.origin+url.pathname,'https://ekodi.kr/auth/');
  assert.equal(url.searchParams.get('site'),'seonammedi');
  assert.equal(url.searchParams.get('return_to'),'https://seonammedi.kr/?admin_view=committee-activity');
  assert.equal(new URL(ctx.adminLoginUrl('javascript:alert(1)')).searchParams.get('return_to'),'https://seonammedi.kr/?admin_view=timeline','unknown views fall back');
  const handoff=fn(js,'consumeNoticeHandoff');
  assert.match(handoff,/ADMIN_LOGIN_VIEWS\.includes\(adminView\)/);
  assert.match(handoff,/syncViewFromLocation\(\)/);
  assert.match(fn(js,'syncAdminLoginButtons'),/button\.hidden=Boolean\(publicTimelineAdminMode\)/);
});

test('expired sessions renew through the SeonamMedi auth bridge before admin authorization',async()=>{
  const js=await read('app.js');
  const refresh=fn(js,'refreshNoticeSession');
  assert.match(refresh,/fetch\('\/api\/seonammedi\/admin\/auth\/refresh'/);
  assert.doesNotMatch(refresh,/sb_secret|service_role/);
  const flow=fn(js,'initNoticeFlow');
  assert.ok(flow.indexOf('refreshNoticeSession()')>=0&&flow.indexOf('refreshNoticeSession()')<flow.indexOf('initPublicAdminControls()'));
});

test('existing in-place admin CRUD for both menus stays wired',async()=>{
  const js=await read('app.js');
  for(const marker of ['data-timeline-edit','data-timeline-delete','data-committee-edit','data-committee-delete','data-committee-news-edit','data-committee-news-delete','bindPublicTimelineAdmin','bindCommitteeActivityAdmin','bindCommitteeNewsAdmin'])
    assert.ok(js.includes(marker),marker);
});
