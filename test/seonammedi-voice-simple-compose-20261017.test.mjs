import test from 'node:test';
import assert from 'node:assert/strict';
import {Script} from 'node:vm';
import board from '../services/independent-board/worker.js';

test('citizen voice is one simple message form and optional details on both hosts',async()=>{
  for(const uri of ['https://seonammedi.kr/board/voices','https://ekodi.kr/seonammedi/board/voices']){
    const res=await board.fetch(new Request(uri),{});
    assert.equal(res.status,200,uri);
    const html=await res.text();
    assert.match(html,/<button id="writeToggle">글쓰기<\/button>/);
    assert.match(html,/<form id="writeForm" class="board-panel voice-simple-compose" hidden>/);
    assert.match(html,/<textarea id="voiceMessage" name="message"[^>]*required/);
    assert.match(html,/<details class="voice-optional"><summary>이름·분류·사진 추가 \(선택\)<\/summary>/);
    assert.match(html,/name="category"/);
    assert.match(html,/name="name"/);
    assert.match(html,/name="images"/);
    assert.match(html,/name="message"/);
    assert.match(html,/id="imagePreview"/);
    assert.doesNotMatch(html,/id="voiceManageToggle"|id="voiceAdminLogin"/);
    assert.doesNotMatch(html,/claimComposeAutoAuth|VOICE_COMPOSE_AUTH_ONCE_KEY/);
    const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
    assert.equal(scripts.length,1);
    assert.doesNotThrow(()=>new Script(scripts[0][1]));
  }
});

test('admin edits appear automatically only after permission-gated admin API succeeds',async()=>{
  const response=await board.fetch(new Request('https://seonammedi.kr/board/voices'),{});
  const html=await response.text();
  assert.match(html,/if\(search\.value\.trim\(\)\|\|!voiceVerified\)return/);
  assert.match(html,/call\("\/board\/api\/admin\/posts",\{headers:\{authorization:"Bearer "\+t\}\}\)/);
  assert.match(html,/adminItems=data\.items\|\|\[\];admin=true;render\(adminItems,true\)/);
  assert.match(html,/data-edit=/);
  assert.match(html,/data-delete=/);
  assert.match(html,/data-reply-delete=/);
  assert.doesNotMatch(html,/adminMode|manageToggle/);
  assert.match(html,/if\(composeRequested&&allowed\)\{showEditor\(\);clearComposeQuery\(\);return\}/);
  assert.match(html,/if\(composeRequested&&!allowed\)/); assert.match(html,/auth_attempt/);
  assert.doesNotMatch(html,/if\(composeRequested&&!allowed\)\{if\(claimComposeAutoAuth/);
  assert.match(html,/auth\.searchParams\.set\("select_account","1"\)/);
});

test('unauthenticated visitors cannot gain writer or moderator privileges',async()=>{
  for(const [path,status] of [['/board/api/auth/session',401],['/board/api/admin/posts',403]]){
    const result=await board.fetch(new Request('https://seonammedi.kr'+path),{});
    assert.equal(result.status,status,path);
  }
});
