import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {handleRealtimeControl, authorizationRole} from '../realtime-control.js';

const file=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
function db(){
  let roomMutations=0;
  return {get roomMutations(){return roomMutations},prepare(sql){
    return {bind(){
      return {
        first:async()=>sql.includes('FROM sessions JOIN admins')
          ?{email:'superadmin@example.test',role:'super_admin',expires_at:'2099-01-01T00:00:00.000Z'}
          :null,
        all:async()=>({results:[]}),
        run:async()=>{roomMutations++;return {success:true}}
      };
    }};
  }};
}
test('Church host preflight checks current server-side superadmin session, without creating broadcast',async()=>{
  const database=db();
  const res=await handleRealtimeControl(new Request('https://ekodi.kr/api/realtime/host-access?tenant=ekodichurch',{
    method:'GET',headers:{authorization:'Bearer central-admin-token'}
  }),{DB:database});
  assert.equal(res.status,200);
  assert.deepEqual(await res.json(),{ok:true,authenticated:true,authorized:true,tenant:'ekodichurch'});
  assert.equal(database.roomMutations,0,'preflight must never start a room or broadcast');
});
test('Church host preflight cannot grant a guest a broadcast role',async()=>{
  const database=db();
  const response=await handleRealtimeControl(new Request('https://ekodi.kr/api/realtime/host-access?tenant=ekodichurch'),{DB:database});
  assert.equal(response.status,401);
  const data=await response.json();
  assert.equal(data.error,'authentication_required');
  assert.match(data.loginUrl,/site=church/);
  assert.equal(database.roomMutations,0);
});
test('host preflight blocks invalid tenants and all mutation methods',async()=>{
  const database=db();
  const invalid=await handleRealtimeControl(new Request('https://ekodi.kr/api/realtime/host-access?tenant=unknown',{headers:{authorization:'Bearer tok'}}),{DB:database});
  assert.equal(invalid.status,400);
  const post=await handleRealtimeControl(new Request('https://ekodi.kr/api/realtime/host-access?tenant=ekodichurch',{method:'POST',headers:{authorization:'Bearer tok','content-type':'application/json'},body:'{}'}),{DB:database});
  assert.equal(post.status,405);
  assert.equal(database.roomMutations,0);
});
test('tenant roles do not leak across independent Church and business broadcasting',()=>{
  const church={email:'church@example.test',contexts:[{tenant:'ekodi-church',authorizationRole:'tenant_admin'}]};
  assert.equal(authorizationRole(church,'ekodichurch',{}),'tenant_admin');
  assert.equal(authorizationRole(church,'ekodi-biz',{}),'');
  const outsider={email:'public@example.test',contexts:[]};
  assert.equal(authorizationRole(outsider,'ekodichurch',{}),'');
});
test('Church studio checks server role before starting and offers account chooser without login loops',async()=>{
  const [page,script,styles,auth]=await Promise.all([
    file('tenant-live-page.js'),file('tenant-live.js'),file('tenant-live.css'),file('auth-site/client-auth.js')
  ]);
  assert.match(page,/id="hostAccessStatus"/);
  assert.match(page,/id="hostAccessLogin"/);
  assert.match(script,/async function verifyHostAccess\(\)/);
  assert.match(script,/api\('\/host-access\?tenant='/);
  assert.match(script,/if\(!await verifyHostAccess\(\)\)return/);
  assert.match(script,/방송 진행 권한이 없습니다/);
  assert.match(script,/Google 계정/);
  assert.match(script,/select_account=1&return_to/);
  assert.match(auth,/site==='seonammedi'\|\|site==='church'/);
  assert.match(auth,/if\(CHOOSE_ACCOUNT\)\{await renderGoogle\(\);return\}/);
  assert.match(auth,/!CHOOSE_ACCOUNT\)queueMicrotask/);
  assert.match(styles,/\.studio>\.stage\{position:sticky/);
  assert.match(styles,/max-width:900px/);
});
