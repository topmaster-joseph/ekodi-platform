import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const api=read('supabase/functions/identity-api/index.ts');
const js=read('auth-site/email-password.js');
const router=read('auth-site/auth-router.js');
const build=read('scripts/build.mjs');
const surface=read('canonical-surface-router.js');
const css=read('auth-site/auth.css');
const doc=read('docs/auth/EKODI-EMAIL-PASSWORD-ONBOARDING.md');

test('email/password front end only activates after independent server-side delivery gates',()=>{
  assert.match(api,/Deno\.env\.get\("EKODI_EMAIL_PASSWORD_ENABLED"\)==="true"/);
  assert.match(api,/Deno\.env\.get\("EKODI_AUTH_EMAIL_CONFIRM_VERIFIED"\)==="true"/);
  assert.match(api,/Deno\.env\.get\("EKODI_AUTH_SMTP_VERIFIED"\)==="true"/);
  assert.match(api,/req\.method==="GET"&&path==="\/email\/readiness"/);
  assert.match(js,/readiness\.enabled!==true/);
  assert.match(js,/if\(!response\.ok\)return false/);
  assert.match(js,/if\(!host\|\|document\.getElementById\('ekodiEmailPassword'\)\)return false/);
  assert.doesNotMatch(js,/localStorage\.setItem\(.+password/);
  assert.doesNotMatch(js,/console\.(log|info|error)\(.+secret/);
});

test('auth confirmed email becomes one EKODI Person; anonymous email cannot promote itself',()=>{
  assert.match(api,/user\.app_metadata\?\.provider==="email"/);
  assert.match(api,/if\(!user\.email_confirmed_at\)return json\(req,\{error:"verified_email_required"\},403\)/);
  assert.match(api,/p_provider:"email"/);
  assert.match(api,/p_provider_subject:user\.id/);
  assert.match(api,/ensure_person_identity/);
  assert.match(api,/recordEmailVerification\("email",user\.id,true\)/);
  assert.match(api,/syncPerson\(user\.id\)/);
  assert.match(api,/personId!==created/);
  assert.match(api,/user\.app_metadata\?\.provider==="email"&&!ekodiId/);
  assert.doesNotMatch(api,/\.eq\("email",email\).*\.update\(\{person_id:/);
});

test('simple email sign-up, OTP confirmation, reset and login reuse central original-page session',()=>{
  for(const m of ['signUp','signInWithPassword','verifyOtp','resetPasswordForEmail','updateUser','resend'])
    assert.ok(js.includes('supabase.auth.'+m+'('),'missing '+m);
  assert.match(js,/if\(data\?\.session\)\{/);
  assert.match(js,/supabase\.auth\.signOut\(\{scope:'local'\}\)/);
  assert.match(js,/type:'signup'/);
  assert.match(js,/type:'recovery'/);
  assert.match(js,/password\.value='';otp\.value=''/);
  assert.match(js,/location\.replace\(authReturnPath\(location\.search\)\)/);
  assert.match(router,/params\.get\('ekodi_email_action'\)==='reset'/);
  assert.match(router,/mountEmailPassword\(\{resetOnly:true\}\)/);
  assert.ok(router.indexOf("params.get('ekodi_email_action')==='reset'")<router.indexOf("await loadClientAuth()"));
  assert.match(js,/const READINESS=.*\/email\/readiness/);
  assert.match(js,/const ORIGIN='https:\/\/ekodi\.kr'/);
  assert.match(js,/password\.minLength=12/);
});

test('assets and canonical routes keep Google/Naver/Kakao entry unchanged',()=>{
  assert.match(build,/'email-password\.js'/);
  assert.match(surface,/\/'email-password\.js'/); // replaced in test below with actual path check
  assert.ok(surface.includes("'/email-password.js'"));
  assert.match(css,/ekodi-email-password/);
  assert.match(router,/site==='admin'\)await import\('\.\/admin-auth\.js/);
  assert.match(router,/federated\.handleCallback\(\)/);
  assert.match(doc,/EKODI Person/);
});
