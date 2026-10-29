import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {authReturnPath,verifiedEmailReturnGuardKey} from '../auth-site/email-password.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const email=read('auth-site/email-password.js');
const entry=read('auth-site/auth-entry.js');
const client=read('auth-site/client-auth.js');
const router=read('auth-site/auth-router.js');

test('successful email/OTP sign-in clears precisely the existing central navigation loop guard',()=>{
  const scenarios=[
    {query:'?site=portal',key:'ekodi-auth-entry:portal:',returnUrl:'/auth/?site=portal'},
    {query:'?site=mission&return_to=https%3A%2F%2Fekodi.kr%2Fekodimission%2F',key:'ekodi-auth-entry:mission:https://ekodi.kr/ekodimission/',returnUrl:'/auth/?site=mission&return_to=https%3A%2F%2Fekodi.kr%2Fekodimission%2F'},
    {query:'?site=church&return_to=https%3A%2F%2Fekodi.kr%2Fekodichurch%2F%3Ftab%3Dtoday&ekodi_email_mode=verify',key:'ekodi-auth-entry:church:https://ekodi.kr/ekodichurch/?tab=today',returnUrl:'/auth/?site=church&return_to=https%3A%2F%2Fekodi.kr%2Fekodichurch%2F%3Ftab%3Dtoday'},
  ];
  for(const {query,key,returnUrl} of scenarios){
    assert.equal(verifiedEmailReturnGuardKey(query),key);
    assert.equal(authReturnPath(query),returnUrl);
  }
  assert.ok(entry.includes('const guardKey = `ekodi-auth-entry:${site}:${returnTo}`;'));
  assert.match(email,/sessionStorage\.removeItem\(verifiedEmailReturnGuardKey\(location\.search\)\)/);
  assert.match(email,/location\.replace\(authReturnPath\(location\.search\)\)/);
});

test('only a successfully verified email session resumes navigation; no unauthenticated bypass of the loop guard',()=>{
  const verify=email.slice(email.indexOf("}else if(mode==='verify'){"),email.indexOf("}else if(mode==='login'){"));
  const login=email.slice(email.indexOf("}else if(mode==='login'){"),email.indexOf("}else{",email.indexOf("}else if(mode==='login'){")));
  const signup=email.slice(email.indexOf("if(mode==='signup'){"),email.indexOf("}else if(mode==='verify'){"));
  assert.match(verify,/supabase\.auth\.verifyOtp\(\{email:address,token:otp\.value\.trim\(\),type:'signup'\}\)/);
  assert.ok(verify.indexOf('if(error)throw error;')<verify.indexOf('resumeAfterVerifiedEmailSession();'));
  assert.match(login,/supabase\.auth\.signInWithPassword\(\{email:address,password:secret\}\)/);
  assert.ok(login.indexOf('if(!data?.user?.email_confirmed_at)throw')<login.indexOf('resumeAfterVerifiedEmailSession();'));
  assert.doesNotMatch(signup,/resumeAfterVerifiedEmailSession/);
  assert.equal((email.match(/resumeAfterVerifiedEmailSession\(\);/g)||[]).length,2);
  assert.match(client,/async function handoffExistingSession\(s\)/);
  assert.match(router,/await loadClientAuth\(\)/);
  assert.ok(entry.includes('const guardKey = `ekodi-auth-entry:${site}:${returnTo}`;'));
});

test('password recovery is not automatically treated as a normal logged-in session',()=>{
  const reset=email.slice(email.indexOf("const {error:verifyError}=await supabase.auth.verifyOtp"));
  assert.match(reset,/type:'recovery'/);
  assert.match(reset,/supabase\.auth\.updateUser\(\{password:secret\}\)/);
  assert.match(reset,/await supabase\.auth\.signOut\(\{scope:'local'\}\)/);
  assert.doesNotMatch(reset,/resumeAfterVerifiedEmailSession\(\);/);
});
