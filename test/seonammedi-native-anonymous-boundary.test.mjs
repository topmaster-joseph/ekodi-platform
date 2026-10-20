import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import board from '../services/independent-board/worker.js';

const script=await readFile(new URL('../scripts/verify-seonammedi-nav-guest-native.mjs',import.meta.url),'utf8');
const origins=['https://seonammedi.kr','https://ekodi.kr/seonammedi'];
const emptyDb={prepare:()=>({
  bind:()=>({all:async()=>({results:[]})}),
  all:async()=>({results:[]})
})};

test('first-party Chromium auditor keeps GET-only and masks private auth data',()=>{
  assert.match(script,/const GUEST_API_CHECKS=Object\.freeze\(\[/);
  assert.match(script,/context\.request\.get\(url,options\)/);
  assert.match(script,/All probes are GET-only/);
  assert.match(script,/Never record returned user data/);
  assert.match(script,/result\.status===check\.status/);
  assert.match(script,/cache-control/);
  assert.match(script,/GUEST_API_CHECKS/);
  assert.doesNotMatch(script,/BOARD_CANARY_GOOGLE_TOKEN|SEONAMMEDI_BOARD_CANARY_GOOGLE_TOKEN/);
});

test('anonymous public lists remain readable but member/admin API returns 401 or 403 on both mounts',async()=>{
  const checks=[
    ['/board/api/posts',200,null],
    ['/board/api/notices',200,null],
    ['/board/api/auth/session',401,'google_login_required'],
    ['/board/api/finance/summary',401,'google_login_required'],
    ['/board/api/finance',403,'finance_detail_admin_only'],
    ['/board/api/admin/posts',403,'voices_forbidden'],
    ['/board/api/admin/notices',403,'notices_forbidden'],
    ['/board/api/admin/finance',403,'finance_forbidden']
  ];
  for(const base of origins)for(const [route,status,error] of checks){
    const res=await board.fetch(new Request(base+route),{BOARD_DB:emptyDb});
    assert.equal(res.status,status,base+route);
    const json=await res.json();
    if(error)assert.equal(json.error,error,base+route);
    else{assert.equal(json.ok,true,base+route);assert.ok(Array.isArray(json.items),base+route)}
    assert.match(res.headers.get('cache-control')||'',/no-store/,base+route);
  }
});

test('bearer-shaped but invalid production auth must never be treated as signed-in',async()=>{
  const old=globalThis.fetch;
  let checks=0;
  globalThis.fetch=async (_url,options)=>{
    checks++;
    assert.match(options.headers.authorization,/Bearer /);
    return Response.json({error:'invalid_jwt'},{status:401});
  };
  try{
    for(const origin of origins){
      const res=await board.fetch(new Request(origin+'/board/api/auth/session',{
        headers:{authorization:'Bearer ekodi-native-invalid-canary-token'}
      }),{});
      assert.equal(res.status,401);
      assert.equal((await res.json()).error,'google_login_required');
    }
    assert.equal(checks,origins.length);
  }finally{globalThis.fetch=old}
});
