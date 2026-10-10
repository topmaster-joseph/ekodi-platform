import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import board from '../services/independent-board/worker.js';

const source=await readFile(new URL('../services/independent-board/worker.js',import.meta.url),'utf8');

test('voice posts and replies require Google login before any rate limit, DB, upload or queue operation',async()=>{
  for(const [route,payload] of [['/board/api/posts',{}],['/board/api/posts/1/replies',{}]]){
    const response=await board.fetch(new Request('https://seonammedi.kr'+route,{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify(payload)
    }),{});
    assert.equal(response.status,401,route);
    const value=await response.json();
    assert.equal(value.error,'google_login_required');
  }
  assert.match(source,/if\(path==='\/api\/posts'&&req\.method==='POST'\)\{\s*if\(!await signedInGoogle\(req\)\)/);
  assert.match(source,/if\(reply&&req\.method==='POST'\)\{\s*if\(!await signedInGoogle\(req\)\)/);
});

test('voice UI keeps free reading and sharing but sends bearer token on both write requests',async()=>{
  const page=await board.fetch(new Request('https://seonammedi.kr/board/voices'),{});
  assert.equal(page.status,200);
  const html=await page.text();
  assert.match(html,/누구나 열람·공유할 수 있으며, 시민의견과 답글은 Google 로그인 후 작성/);
  assert.doesNotMatch(html,/누구나 로그인 없이 등록하고 답글/);
  assert.match(html,/if\(!token\(\)\)\{login\(\);return\}/);
  assert.match(html,/write\.onsubmit=async e=>\{e\.preventDefault\(\);const t=token\(\)/);
  assert.match(html,/list\.addEventListener\("submit",async e=>[\s\S]*?const t=token\(\)/);
  const writes=html.match(/authorization:"Bearer "\+t/g)||[];
  assert.ok(writes.length>=2,'Both post and reply writes carry authorization');
  assert.match(html,/data-share=/);
});

test('public board read, admin-only finance and notice boundaries remain independent',()=>{
  assert.match(source,/if\(path==='\/api\/posts'&&req\.method==='GET'\)return list\(env,url\)/);
  assert.match(source,/if\(path==='\/api\/finance'&&req\.method==='GET'\)return json\(\{ok:false,error:'finance_detail_admin_only'/);
  assert.match(source,/if\(path==='\/api\/admin\/posts'&&req\.method==='GET'\)return adminList\(req,env\)/);
  assert.match(source,/if\(path==='\/api\/admin\/notices'&&req\.method==='POST'\)return createNotice\(req,env\)/);
});
