import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const source=await readFile(new URL('../supabase/functions/church-pastor-api/index.ts',import.meta.url),'utf8');
const BASE='https://renzehysxirjilvdxacv.supabase.co';

function scenario({email='outsider@example.test',google=false,grantSource='',existingStaff=null,confirmed=true}={}){
  const calls=[];
  let handler;
  const upstream=async (url,options={})=>{
    const path=String(url);
    calls.push(path);
    if(path.includes('/auth/v1/user')){
      return new Response(JSON.stringify({
        id:'6b5bb93a-1992-4127-934e-a04e17889221',email,
        email_confirmed_at:confirmed?'2026-10-01T00:00:00Z':null
      }),{status:200});
    }
    if(path.includes('/rest/v1/rpc/church_pastor_staff_for_user')){
      return new Response(JSON.stringify(existingStaff),{status:200});
    }
    if(path.includes('/rest/v1/login_identities')){
      assert.match(path,/provider=eq.google/);
      assert.match(path,/status=eq.active/);
      const results=google?[{provider_subject:'google-sub-test'}]:[];
      return new Response(JSON.stringify(results),{status:200});
    }
    if(path.includes('/rest/v1/site_access_registry')){
      assert.match(path,/site_key=eq.church/);
      assert.match(path,/role=eq.tenant_admin/);
      assert.match(path,/status=eq.active/);
      return new Response(JSON.stringify(grantSource?[{source:grantSource}]:[]),{status:200});
    }
    throw new Error('Unexpected upstream endpoint '+path);
  };
  const Deno={env:{get:key=>
    key==='SUPABASE_URL'?BASE:
    key==='SUPABASE_SERVICE_ROLE_KEY'?'service-role-test-key':''},
    serve:fn=>{handler=fn;}};
  runInNewContext(source,{Deno,fetch:upstream,Request,Response,Headers,URL,URLSearchParams});
  const request=new Request(BASE+'/functions/v1/church-pastor-api?scope=staff-access',{
    method:'GET',headers:{origin:'https://ekodi.kr',authorization:'Bearer user-test-session'}
  });
  return {run:()=>handler(request),calls};
}

test('both protected EKODI superadmins resolve church role only after Google proof',async()=>{
  for(const email of ['topmaster.joseph@gmail.com','joseph@ekodi.kr']){
    const verified=scenario({email,google:true});
    const res=await verified.run();
    assert.equal(res.status,200,email);
    const body=await res.json();
    assert.equal(body.role,'senior_pastor');
    const denied=scenario({email,google:false});
    assert.equal((await denied.run()).status,403,email);
  }
});

test('additional ekodichurch manager needs an explicit active source and verified Google identity',async()=>{
  const allowed=scenario({email:'ekodichurch@gmail.com',google:true,grantSource:'church_google_additional_admin'});
  const r=await allowed.run();
  assert.equal(r.status,200);
  assert.equal((await r.json()).role,'pastor');
  for(const options of [
    {email:'ekodichurch@gmail.com',google:true},
    {email:'ekodichurch@gmail.com',google:false,grantSource:'church_google_additional_admin'},
    {email:'outsider@example.test',google:true},
    {email:'outsider@example.test',google:true,grantSource:'unrelated_registered_source'}
  ]){
    const denied=await scenario(options).run();
    assert.equal(denied.status,403,JSON.stringify(options));
    assert.equal((await denied.json()).error,'CHURCH_STAFF_REQUIRED');
  }
});

test('vacant-site administrator grants are scoped and do not extend to arbitrary users',async()=>{
  const approved=scenario({email:'newmanager@example.test',google:true,grantSource:'super_admin_vacant_site_bootstrap'});
  const res=await approved.run();
  assert.equal(res.status,200);
  assert.equal((await res.json()).role,'pastor');
  const denied=await scenario({email:'newmanager@example.test',google:false,grantSource:'super_admin_vacant_site_bootstrap'}).run();
  assert.equal(denied.status,403);
});

test('existing local staff retains least-privilege role when no additional grant exists',async()=>{
  const normal=scenario({email:'viewer@example.test',google:false,existingStaff:{role:'viewer',active:true}});
  const res=await normal.run();
  assert.equal(res.status,200);
  assert.equal((await res.json()).role,'viewer');
});

test('unauthenticated Google identity never causes a role grant',async()=>{
  const missingConfirmation=await scenario({email:'ekodichurch@gmail.com',google:true,grantSource:'church_google_additional_admin',confirmed:false}).run();
  assert.equal(missingConfirmation.status,401);
});
