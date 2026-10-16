import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import board from '../services/independent-board/worker.js';

const workflow=await readFile(new URL('../.github/workflows/deploy-independent-board.yml',import.meta.url),'utf8');
const roots=['https://seonammedi.kr','https://ekodi.kr/seonammedi'];
const menu=['공지','활동이력','관련소식','소통채널','시민의견','조직'];

test('deployed board smoke validates finance content on both mounts without retired top-level nav',()=>{
  assert.match(workflow,/Verify production board UI/);
  assert.match(workflow,/verify_contains "board six-menu navigation"/);
  for(const label of menu)assert.ok(workflow.includes("'"+label+"'"),label);
  assert.doesNotMatch(workflow,/'aria-current="page" href="\/board\/finance">회계'/);
  assert.doesNotMatch(workflow,/'aria-current="page" href="\/seonammedi\/board\/finance">회계'/);
  // A finance page stays accessible as a sibling route, not as a seventh header link.
  for(const label of [
    'finance route renders finance page',
    'internal finance page',
    'external finance slash page parity',
    'internal finance slash page parity',
    'finance uses six-menu notices link',
    'internal finance notices link',
    'external finance slash notices link',
    'internal finance slash notices link'
  ])assert.ok(workflow.includes('verify_contains "'+label+'"'),label);
  assert.match(workflow,/Verify production Google login-first API without credentials/);
  assert.match(workflow,/Production queue-create-list-reply canary and cleanup/);
  assert.match(workflow,/Anonymous board write must return 401/);
});

test('live-rendered board headers share one six-menu hierarchy on both mounts and slash variants',async()=>{
  for(const root of roots)for(const route of ['voices','finance','notices'])for(const slash of ['','/']){
    const response=await board.fetch(new Request(root+'/board/'+route+slash),{});
    assert.equal(response.status,200,root+' '+route+slash);
    const html=await response.text();
    const nav=html.match(/<nav class="ekodi-six-nav" aria-label="주요 메뉴">([\s\S]*?)<\/nav>/)?.[1];
    assert.ok(nav,'missing board nav '+route);
    let previous=-1;
    for(const label of menu){
      const loc=nav.indexOf('>'+label+'</a>');
      assert.ok(loc>previous,'incorrect top-menu order '+label+' on '+route);
      previous=loc;
    }
    assert.doesNotMatch(nav,/nav-group|nav-submenu|<button/,'header navigation is flat');
    const nested=html.match(/<template id="central-category-link-contract">([\s\S]*?)<\/template>/)?.[1]||'';
    const prefix=root.includes('ekodi.kr')?'/seonammedi':'';
    assert.ok(!nested.includes('>회계</a>'));
    assert.ok(!nested.includes('>회계</a>')&&!nested.includes('>회의록</a>'));
    assert.ok(!nested.includes('>회의록</a>'));
    assert.equal((nav.match(/>회계<\/a>/g)||[]).length,0,'no top-level finance');
    assert.doesNotMatch(nav,/data-category-menu="공지"/);
    assert.match(nav,/href="[^"]*\/board\/notices">공지<\/a>/);
    assert.ok(html.includes('id="writeToggle"')||route!=='voices');
    assert.ok(html.includes('return_to')||route!=='voices','guest writes must retain Google login return');
  }
});

test('guest authentication stays denied at independent-board session gate',async()=>{
  const response=await board.fetch(new Request('https://seonammedi.kr/board/api/auth/session'),{});
  assert.equal(response.status,401);
  const result=await response.json();
  assert.equal(result.authenticated,false);
  assert.equal(result.error,'google_login_required');
});
