import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const source=await readFile(new URL('../supabase/functions/church-pastor-api/index.ts',import.meta.url),'utf8');
const origin='https://ekodi.kr';
function endpoint({role='pastor',bearer=true,method='GET',from=origin}={}){
  let handler;
  const calls=[];
  const upstream=async (url,init={})=>{
    const path=String(url);
    calls.push({path,method:init.method||'GET'});
    if(path.includes('/auth/v1/user'))return new Response(JSON.stringify({id:'verified-user-id',email:'church-operator@example.invalid',email_confirmed_at:'2026-10-01T00:00:00Z'}),{status:200});
    if(path.includes('/rest/v1/rpc/church_pastor_staff_for_user'))return new Response(JSON.stringify(role.startsWith('registry_')?null:{role}),{status:200});
    if(path.includes('/rest/v1/site_access_registry')){
      assert.match(path,/site_key=eq.church/);
      assert.match(path,/role=eq.tenant_admin/);
      assert.equal(init.headers.authorization,'Bearer user-test-session');
      return new Response(JSON.stringify(role==='registry_worship_admin'?[{site_key:'church',role:'tenant_admin'}]:[]),{status:200});
    }
    throw Error('Unexpected service call: '+path);
  };
  const Deno={env:{get:key=>key==='SUPABASE_URL'?'https://renzehysxirjilvdxacv.supabase.co':key==='SUPABASE_SERVICE_ROLE_KEY'?'test-server-key':''},serve:callback=>{handler=callback}};
  runInNewContext(source,{Deno,fetch:upstream,Request,Response,Headers,URL});
  const request=new Request('https://renzehysxirjilvdxacv.supabase.co/functions/v1/church-pastor-api?scope=worship-access',{method,headers:{origin:from,...(bearer?{authorization:'Bearer user-test-session'}:{})}});
  return {run:()=>handler(request),calls};
}

test('worship capability checks server-resolved tenant staff role, never a UI claim',async()=>{
  for(const role of ['pastor','senior_pastor','staff','worship_admin']){
    const api=endpoint({role});
    const response=await api.run();
    assert.equal(response.status,200,role);
    assert.deepEqual(JSON.parse(await response.text()),{ok:true,permissions:{worship:true},churchSlug:'ekodi-church'});
    assert.equal(api.calls.length,2,'only central user + staff RPC');
  }
  for(const role of ['viewer','care_staff','church_treasurer','church_finance','registry_viewer']){
    const response=await endpoint({role}).run();
    assert.equal(response.status,403,role);
    assert.equal((await response.json()).error,'ROLE_NOT_ALLOWED');
  }
});
test('RLS-scoped tenant administrator has worship access without a church_staff row',async()=>{
  const api=endpoint({role:'registry_worship_admin'});
  const response=await api.run();
  assert.equal(response.status,200);
  assert.deepEqual(JSON.parse(await response.text()),{ok:true,permissions:{worship:true},churchSlug:'ekodi-church'});
  assert.equal(api.calls.length,3);
});
test('worship capability endpoint rejects guests, mutation requests and foreign origin',async()=>{
  const guest=endpoint({bearer:false});
  const guestResponse=await guest.run();
  assert.equal(guestResponse.status,401);
  assert.equal(guest.calls.length,0);
  const post=await endpoint({method:'POST'}).run();
  assert.equal(post.status,405);
  const foreign=endpoint({from:'https://untrusted.example'});
  const foreignResponse=await foreign.run();
  assert.equal(foreignResponse.status,403);
  assert.equal(foreign.calls.length,0);
});
test('worship permission is separate from financial and cross-tenant powers',()=>{
  assert.match(source,/WORSHIP_ACCESS_ROLES=new Set\(\['senior_pastor','pastor','staff','worship_admin'\]\)/);
  assert.match(source,/scope'\)===\x27worship-access\x27/);
  assert.doesNotMatch(source,/WORSHIP_ACCESS_ROLES=new Set\(.*church_finance/);
});
