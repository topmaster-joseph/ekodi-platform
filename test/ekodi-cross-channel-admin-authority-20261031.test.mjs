import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=(path)=>readFile(new URL('../'+path,import.meta.url),'utf8');

const api=await read('supabase/functions/access-api/index.ts');
const googleAdmin=await read('admin-google-auth.js');
const identity=await read('supabase/functions/identity-api/index.ts');
const linked=await read('supabase/migrations/20261027120000_ekodi_account_unified_proof.sql');

function googleIdentityCheck(rows=[],error=null) {
  const seen=[];
  const admin={from(name){
    assert.equal(name,'login_identities');
    const conditions=[];
    const query={
      select(fields){assert.equal(fields,'email');return this;},
      eq(column,value){conditions.push([column,value]);return this;},
      then(resolve,reject){seen.push(conditions);
        const data=rows.filter(row=>conditions.every(([key,val])=>row[key]===val));
        return Promise.resolve({data,error}).then(resolve,reject);
      }
    };
    return query;
  }};
  const source=api.match(/async function hasVerifiedGoogleAdminIdentity\([^\n]+\)\{[\s\S]*?\n\}/)?.[0];
  assert.ok(source,'server-side identity helper missing');
  const js=source.replace('account:{person_id:string;verified_emails:string[]}', 'account');
  return {guard:new Function('admin','return ('+js+');')(admin),seen};
}

test('root admin requires Google proof, a server role and email verification',()=>{
  assert.match(api,/if\(!account\|\|!await hasVerifiedGoogleAdminIdentity\(account\)\)return false/);
  assert.match(api,/\.from\("profiles"\)\.select\("platform_admin"\)/);
  assert.match(api,/BOOTSTRAP_SUPER_ADMIN_EMAILS\.has/);
  assert.match(api,/\.eq\("provider","google"\)/);
  assert.match(api,/\.eq\("email_verified",true\)/);
  assert.match(api,/\.eq\("status","active"\)/);
  assert.match(linked,/u\.email_confirmed_at is not null and lower\(u\.email\) = lower\(li\.email\)/);
  assert.doesNotMatch(api.slice(api.indexOf('async function platformAdmin'),api.indexOf('async function tenantReviewerAuthorization')),/user_metadata|raw_user_meta_data/);
});

test('verified Google identity on same Person satisfies the extra platform-admin evidence',async()=>{
  const {guard,seen}=googleIdentityCheck([
    {person_id:'person-a',provider:'google',status:'active',email_verified:true,email:'owner@example.test'}
  ]);
  assert.equal(await guard({person_id:'person-a',verified_emails:['OWNER@example.test']}),true);
  assert.ok(seen.length===1);
});
test('different provider, different Person or unverified Google cannot become root admin',async()=>{
  const rows=[
    {person_id:'person-a',provider:'kakao',status:'active',email_verified:true,email:'owner@example.test'},
    {person_id:'person-b',provider:'google',status:'active',email_verified:true,email:'owner@example.test'},
    {person_id:'person-a',provider:'google',status:'active',email_verified:false,email:'owner@example.test'},
    {person_id:'person-a',provider:'google',status:'revoked',email_verified:true,email:'owner@example.test'},
    {person_id:'person-a',provider:'google',status:'active',email_verified:true,email:'different@example.test'}
  ];
  const {guard}=googleIdentityCheck(rows);
  assert.equal(await guard({person_id:'person-a',verified_emails:['owner@example.test']}),false);
  assert.equal(await guard({person_id:'person-a',verified_emails:[]}),false);
  assert.equal(await guard({person_id:'',verified_emails:['owner@example.test']}),false);
});
test('errors fail closed; Google administrator D1 also pins subject, issuer and audience',async()=>{
  const {guard}=googleIdentityCheck([],new Error('db_unavailable'));
  await assert.rejects(()=>guard({person_id:'a',verified_emails:['a@example.test']}),/db_unavailable/);
  for(const pattern of [/account\.google_sub && account\.google_sub !== payload\.sub/,
    /payload\.email_verified !== true/,/GOOGLE_ISSUERS\.has\(payload\.iss\)/,
    /payload\.nonce !== expectedNonce/,/admin_google_accounts WHERE email = \? AND status = 'active'/])
    assert.match(googleAdmin,pattern);
});
test('explicitly linked sessions share only the already granted tenant role',()=>{
  assert.match(api,/const linkedIds=await personAuthUserIds\(userId\)/);
  assert.match(api,/\.eq\("tenant_id",tenantId\)\.in\("user_id",linkedIds\)\.eq\("status","active"\)/);
  assert.match(api,/if\(error\)throw error/);
  assert.match(identity,/recordEmailVerification/);
  assert.match(linked,/and source\.email_verified/);
});
