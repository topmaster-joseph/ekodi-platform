import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('citizen-voice menu explicitly requests account choice on both SeonamMedi mounts',async()=>{
  const [site,workerSource,layout]=await Promise.all([
    read('sites/seonammedi/public/index.html'),
    read('services/independent-board/worker.js'),
    read('sites/seonammedi/public/board-central-category.js')
  ]);
  assert.match(site,/href="board\/voices\?compose=1&choose_account=1">시민의견/);
  assert.match(workerSource,/link\(boardPath\(req,'voices'\)\+'\?compose=1&choose_account=1','시민의견','voices'\)/);
  assert.match(layout,/board\/voices\?compose=1&choose_account=1/);
  const {default:board}=await import('../services/independent-board/worker.js');
  for(const origin of ['https://seonammedi.kr/board/voices','https://ekodi.kr/seonammedi/board/voices']){
    const res=await board.fetch(new Request(origin),{});
    assert.equal(res.status,200);
    const html=await res.text();
    assert.match(html,/\?compose=1&choose_account=1/);
  }
});

test('account-selection intent is one-time and cannot cause post-auth compose loops',async()=>{
  const worker=await read('services/independent-board/worker.js');
  const client=await read('auth-site/client-auth.js');
  const entry=await read('auth-site/auth-entry.js');
  const router=await read('auth-site/auth-router.js');
  assert.match(worker,/get\("choose_account"\)==="1"\)\{voiceLogin\("compose"\);return\}/);
  assert.match(worker,/target\.searchParams\.delete\("choose_account"\)/);
  assert.match(worker,/auth\.searchParams\.set\("return_to",target\.href\)/);
  assert.match(worker,/auth\.searchParams\.set\("select_account","1"\)/);
  assert.match(worker,/if\(composeRequested&&allowed\)\{write\.hidden=false/);
  assert.match(client,/const CHOOSE_ACCOUNT=site==='seonammedi'&&params\.get\('select_account'\)==='1'/);
  assert.match(client,/if\(CHOOSE_ACCOUNT\)\{await renderGoogle\(\);return\}/);
  assert.match(client,/if\(DIRECT_LOGIN\)/);
  assert.match(client,/auto_select:false/);
  assert.match(client,/button_auto_select:false/);
  assert.match(client,/window\.google\.accounts\.id\.prompt/);
  assert.match(client,/if\(CHOOSE_ACCOUNT\)show\('cancelSignedOut',true\)/);
  assert.match(client,/if\(CHOOSE_ACCOUNT\)target\.searchParams\.delete\('compose'\)/);
  assert.match(client,/use_fedcm_for_button:true/);
  assert.match(client,/if\(CHOOSE_ACCOUNT\)googleButtonOptions\.use_fedcm_for_button=false/);
  assert.match(client,/&&s&&!routing&&!handlingCredential&&!CHOOSE_ACCOUNT/);
  assert.match(entry,/params\.get\('select_account'\) === '1'/);
  assert.match(router,/params\.get\('select_account'\)==='1'/);
});
