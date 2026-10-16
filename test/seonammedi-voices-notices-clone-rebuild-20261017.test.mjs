import test from 'node:test';
import assert from 'node:assert/strict';
import {Script} from 'node:vm';
import {readFile} from 'node:fs/promises';
import board from '../services/independent-board/worker.js';

const src=await readFile(new URL('../services/independent-board/worker.js',import.meta.url),'utf8');

test('replacement citizen page follows notices-style read and compose layout on both hostnames',async()=>{
  for(const url of ['https://seonammedi.kr/board/voices?compose=1&choose_account=1','https://ekodi.kr/seonammedi/board/voices?compose=1&choose_account=1']){
    const r=await board.fetch(new Request(url),{});
    assert.equal(r.status,200);
    const html=await r.text();
    assert.match(html,/id="voiceSearch"/);
    assert.match(html,/id="writeForm"/);
    assert.match(html,/id="voiceMessage"/);
    assert.match(html,/notice-record/);
    assert.match(html,/if\(composeRequested&&allowed\)\{showEditor\(\);clearComposeQuery\(\);return\}/);
    assert.match(html,/if\(!params\.has\("auth_attempt"\)\)\{voiceLogin\(\);return\}/);
    assert.doesNotMatch(html,/if\(composeRequested&&new URLSearchParams/);
    const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
    assert.equal(scripts.length,1);
    assert.doesNotThrow(()=>new Script(scripts[0][1]));
  }
});
test('server-verified session precedes account chooser, no forced re-login loop',()=>{
  const body=src.slice(src.indexOf('function boardPage(req){'),src.indexOf('function financePage(req){'));
  assert.ok(body.indexOf('await verifyVoiceAccount()')<body.indexOf('if(composeRequested&&!allowed)'));
  assert.match(src,/target\.searchParams\.set\("auth_attempt","1"\)/);
  assert.match(body,/auth_attempt/);
});
test('citizen uses Google-only protected writer, while admin write requires voices permission',()=>{
  assert.match(src,/if\(path==='\/api\/posts'&&req\.method==='POST'\)\{/);
  assert.match(src,/if\(!await signedInGoogle\(req\)\)return json/);
  assert.match(src,/async function requireVoiceAdmin\(req\)\{return requirePermission\(req,'voices'\)\}/);
  assert.match(src,/displayName:item\.displayName/); assert.match(src,/contact:item\.contact/); assert.match(src,/status:item\.status/);
  assert.doesNotMatch(src,/DROP TABLE board_posts|DELETE FROM board_posts\s*;/i);
});
