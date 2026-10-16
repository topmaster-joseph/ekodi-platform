import test from 'node:test';
import assert from 'node:assert/strict';
import { Script } from 'node:vm';
import { readFileSync } from 'node:fs';
import board from '../services/independent-board/worker.js';

const worker=readFileSync(new URL('../services/independent-board/worker.js',import.meta.url),'utf8');
const urls=['https://seonammedi.kr/board/voices','https://ekodi.kr/seonammedi/board/voices'];

test('both public board mounts show one parseable composer and explicit inline Admin login',async()=>{
  for(const url of urls){
    const r=await board.fetch(new Request(url),{});
    assert.equal(r.status,200);
    const html=await r.text();
    const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
    assert.equal(scripts.length,1);
    assert.doesNotThrow(()=>new Script(scripts[0][1]));
    assert.match(html,/id="voiceAdminLogin"/);
    assert.match(html,/id="voiceManageToggle"[^>]*hidden/);
    assert.match(html,/requireVoiceAccount\("manage"\)/);
    assert.match(html,/voiceLogin\(intent="compose"\)/);
    assert.match(html,/target\.searchParams\.set\("manage","1"\)/);
    assert.match(html,/auth\.searchParams\.set\("return_to",target.href\)/);
    assert.match(html,/if\(manageRequested\)\{adminMode=true/);
    assert.match(html,/관리 권한을 확인하지 못했습니다/);
    assert.match(html,/data-edit=/);
    assert.match(html,/data-delete=/);
  }
});

test('form-post handoff stores session with isolated fallback and never echoes token hash',async()=>{
  const oldFetch=globalThis.fetch;
  globalThis.fetch=async()=>Response.json({access_token:'example-access',refresh_token:'example-refresh',expires_in:3600,user:{id:'verified'}});
  try{
    const r=await board.fetch(new Request('https://seonammedi.kr/board/voices?compose=1',{method:'POST',
      headers:{'content-type':'application/x-www-form-urlencoded'},
      body:'ekodi_auth_return=1&ekodi_token=one-use-test-code&ekodi_type=email'
    }),{});
    assert.equal(r.status,200);
    const html=await r.text();
    assert.ok(html.includes('sessionStorage.setItem('));
    assert.ok(html.includes('if(saved)location.replace(target)'));
    assert.ok(html.includes('브라우저에서 로그인 정보를 저장하지 못했습니다'));
    assert.ok(!html.includes('one-use-test-code'));
    assert.ok(html.includes('board/voices?compose=1'));
  }finally{globalThis.fetch=oldFetch;}
});

test('canonical Site Core is authoritative for board admin permissions, not board domain',async()=>{
  const previous=globalThis.fetch;
  const queries=[];
  globalThis.fetch=async(url,opts)=>{
    const target=new URL(url);
    queries.push({url:target.href,authorization:opts?.headers?.authorization});
    return Response.json({ok:true,permissions:{voices:true},platform:false});
  };
  const env={BOARD_DB:{prepare(sql){return{all:async()=>({results:[]})}}}};
  try{
    const r=await board.fetch(new Request('https://seonammedi.kr/board/api/admin/posts',
      {headers:{authorization:'Bearer example-verified-admin'}}),env);
    assert.equal(r.status,200);
    assert.deepEqual((await r.json()).items,[]);
    assert.equal(queries.length,1);
    assert.equal(queries[0].url,'https://ekodi.kr/api/seonammedi/admin/me');
    assert.equal(queries[0].authorization,'Bearer example-verified-admin');
  }finally{globalThis.fetch=previous;}
});

test('guest has no Admin edit/delete access even when login button is visible',async()=>{
  const r=await board.fetch(new Request('https://seonammedi.kr/board/api/admin/posts'),{});
  assert.equal(r.status,403);
  assert.match((await r.text()),/forbidden/);
});

test('session fallback does not convert a public Google login into elevated Admin rights',()=>{
  assert.match(worker,/sessionStorage\.setItem\(VOICE_SESSION_KEY,restored\)/);
  assert.match(worker,/sessionStorage\.getItem\(VOICE_SESSION_KEY\)/);
  assert.match(worker,/sessionStorage\.setItem\("'\+SUPABASE_SESSION_KEY\+'"/);
  assert.match(worker,/requireVoiceAdmin\(req\)/);
  assert.match(worker,/\/board\/api\/admin\/posts/);
});
