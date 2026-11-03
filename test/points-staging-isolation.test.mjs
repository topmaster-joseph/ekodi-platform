import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker,{isolateAdminApiOrigin} from '../admin-staging-worker.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const base='https://ekodi-admin-staging.ekodi-development.workers.dev';
test('staging admin sends every /api call to the staging Control API binding, never production',async()=>{
  const seen=[];
  const env={CONTROL_API:{fetch:async req=>{seen.push(new URL(req.url).pathname+' '+req.headers.get('authorization'));return new Response('{"ok":true}',{status:200});}}};
  for(const path of ['/api/session','/api/control/points/overview','/api/control/overview']){
    const res=await worker.fetch(new Request(base+path,{headers:{authorization:'Bearer t'}}),env);
    assert.equal(res.status,200);assert.equal(res.headers.get('x-ekodi-staging'),'ekodi-admin-staging');
  }
  assert.deepEqual(seen,['/api/session Bearer t','/api/control/points/overview Bearer t','/api/control/overview Bearer t']);
  const unbound=await worker.fetch(new Request(base+'/api/session'),{});
  assert.equal(unbound.status,503);
});
test('only the exact admin API origin declaration is rewritten in staging JS',async()=>{
  const js="const API='https://ekodi.kr';const B = 1;let API = 'https://ekodi.kr';location.href='https://ekodi.kr/my/';";
  const out=await (await isolateAdminApiOrigin(new Response(js,{headers:{'content-type':'text/javascript'}}))).text();
  assert.equal(out,"const API=location.origin;const B = 1;let API = location.origin;location.href='https://ekodi.kr/my/';");
  const html=await (await isolateAdminApiOrigin(new Response("API='https://ekodi.kr'",{headers:{'content-type':'text/html'}}))).text();
  assert.equal(html,"API='https://ekodi.kr'");
});
test('staging My reads only the development project; production values stay out',()=>{
  const toml=read('wrangler.my.staging.toml');
  assert.match(toml,/SUPABASE_URL = "https:\/\/lxcxwbdwwojjkgybbqii\.supabase\.co"/);
  assert.match(toml,/SUPABASE_PUBLISHABLE_KEY = "sb_publishable_/);
  assert.doesNotMatch(toml,/renzehysxirjilvdxacv|sb_secret_|service_role/);
  const prod=read('wrangler.my.toml');
  assert.match(prod,/POINTS_ENABLED = "false"/);
});
