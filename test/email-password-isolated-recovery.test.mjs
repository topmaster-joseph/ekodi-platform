import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isolatedRecoveryPath} from '../auth-site/email-password.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const email=read('auth-site/email-password.js');
const entry=read('auth-site/auth-entry.js');
const router=read('auth-site/auth-router.js');

test('password recovery uses only canonical /auth and preserves original service context without email PII',()=>{
  const paths=[
    '?site=portal',
    '?site=mission&return_to=https%3A%2F%2Fekodi.kr%2Fekodimission%2F',
    '?site=church&return_to=https%3A%2F%2Fekodi.kr%2Fekodichurch%2F%3Fdate%3D2026-10-29&ekodi_email_mode=signup',
    '?site=business&returnTo=https%3A%2F%2Fekodi.kr%2Fekodibiz%2F&ekodi_email_action=reset',
  ];
  for(const query of paths){
    const target=new URL(isolatedRecoveryPath(query),'https://ekodi.kr');
    const original=new URLSearchParams(query);
    assert.equal(target.origin,'https://ekodi.kr');
    assert.equal(target.pathname,'/auth/');
    assert.equal(target.searchParams.get('ekodi_email_action'),'reset');
    assert.equal(target.searchParams.has('ekodi_email_mode'),false);
    for(const key of ['site','return_to','returnTo']){
      if(original.has(key))assert.equal(target.searchParams.get(key),original.get(key));
    }
    assert.equal(target.href.includes('@'),false);
  }
});

test('normal sign-in page navigates to isolated recovery BEFORE submitting reset or accepting a recovery OTP',()=>{
  const transition=email.indexOf("if(mode!=='verify'&&mode!=='reset'){");
  const request=email.indexOf('supabase.auth.resetPasswordForEmail(address,{');
  assert.ok(transition>=0&&request>transition);
  assert.match(email,/location\.assign\(isolatedRecoveryPath\(location\.search\)\)/);
  assert.match(email,/redirectTo:new URL\(isolatedRecoveryPath\(location\.search\),ORIGIN\)\.toString\(\)/);
  assert.doesNotMatch(email,/setMode\('reset'\);\s*}\s*message\('메일 발송/);
});

test('isolated reset route does not register normal session handoff listeners or federated buttons',()=>{
  assert.match(entry,/params\.get\('ekodi_email_action'\) === 'reset' \|\|/);
  assert.match(router,/else if\(site!=='admin'&&params\.get\('ekodi_email_action'\)==='reset'\)/);
  assert.match(router,/mountEmailPassword\(\{resetOnly:true\}\)/);
  assert.match(router,/federated\.renderLoginButtons\(\)/);
  assert.match(router,/site!=='admin'&&params\.get\('ekodi_email_action'\)!=='reset'\)federated\.renderLoginButtons/);
  const recoveryBranch=router.slice(router.indexOf("else if(site!=='admin'&&params.get('ekodi_email_action')==='reset')"),router.indexOf("else if(site==='admin')"));
  assert.doesNotMatch(recoveryBranch,/loadClientAuth|auth\.js|admin-auth\.js/);
});

test('recovery OTP is used to update password, then signs out rather than entering the service',()=>{
  const recovery=email.slice(email.indexOf("const {error:verifyError}=await supabase.auth.verifyOtp("));
  const verify=recovery.indexOf("type:'recovery'");
  const change=recovery.indexOf('supabase.auth.updateUser({password:secret})');
  const logout=recovery.indexOf("supabase.auth.signOut({scope:'local'})");
  assert.ok(verify>=0&&change>verify&&logout>change);
  assert.doesNotMatch(recovery,/resumeAfterVerifiedEmailSession\(\);/);
});
