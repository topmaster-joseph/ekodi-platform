import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('public Church sections remain canonical direct links with compact native tabs',async()=>{
  const html=await read('index.html');
  const css=await read('church-homepage-layout.css');
  const names=['about','community','worship','weekly-worship','partner-news','online','location'];
  assert.ok(html.includes('href="/ekodichurch/devotion/"'),'canonical devotional page must remain the eighth tile');
  assert.ok(!html.includes('id="life-hub"'),'legacy life record section must remain retired');
  for(const section of names){
    assert.ok(html.includes('href="#'+section+'"'),'missing public destination '+section);
    assert.ok(html.includes('id="'+section+'"'),'missing section '+section);
  }
  assert.match(css,/body:not\(:has\(main :target\)\) main > \.hero/);
  assert.match(css,/main:has\(:target\) > section:not\(\.hero\):not\(:target\):not\(:has\(:target\)\)/);
  assert.match(css,/body:has\(main :target\) main > \.hero\{/);
  assert.match(css,/position:fixed!important/);
  assert.match(css,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(css,/overflow-wrap:normal!important/);
});

test('member cards retain all personal destinations and readable compact layout',async()=>{
  const html=await read('my/index.html');
  const css=await read('my/styles.css');
  assert.match(css,/\.quick-grid\{display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css,/@media\(max-width:520px\)/);
  assert.match(css,/\.quick-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  for(const url of ['/ekodichurch/my/giving/','/ekodichurch/my/attendance/','/ekodichurch/live/']){
    assert.ok(html.includes('href="'+url+'"'),'missing member link '+url);
  }
  assert.match(html,/id="presenceAdminLink"[^>]*hidden/);
  assert.match(html,/id="loginAction"/);
});

test('member detail pages offer direct accessible tabs without changing authenticated data operations',async()=>{
  const routes=[['giving','나의 헌금'],['attendance','나의 출결']];
  const css=await read('my/member-work-tabs.css');
  assert.match(css,/\.member-work-tabs/);
  assert.match(css,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  for(const [route,label] of routes){
    const html=await read('my/'+route+'/index.html');
    assert.match(html,/aria-label="교회 내 활동 메뉴"/);
    assert.match(html,/href="\/ekodichurch\/my\//);
    assert.match(html,/href="\/ekodichurch\/#weekly-worship"/);
    assert.match(html,/href="\/ekodichurch\/devotion\/"/);
    assert.match(html,new RegExp('href="/ekodichurch/my/'+route+'/" aria-current="page">'+label));
    assert.match(html,/member-work-tabs\.css/);
    assert.match(html,/id="login" class="primary"/);
    assert.match(html,/id="app" hidden/);
  }
});
