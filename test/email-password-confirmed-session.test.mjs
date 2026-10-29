import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../auth-site/email-password.js',import.meta.url),'utf8');

const between=(a,b)=>{
  const first=source.indexOf(a);
  const last=source.indexOf(b,first+a.length);
  assert.ok(first>=0&&last>first,a+' must precede '+b);
  return source.slice(first,last);
};

test('signup requires a 12+ character newly chosen secret; existing password login is not falsely rejected by new signup rules',()=>{
  assert.match(source,/\(mode==='signup'\|\|mode==='reset'\)&&secret\.length<12/);
  assert.match(source,/mode==='login'&&!secret/);
  assert.doesNotMatch(source,/mode!=='verify'&&secret\.length<12/);
});

test('successful signup OTP must have a confirmed email AND a real Supabase Auth session before EKODI handoff',()=>{
  const segment=between("}else if(mode==='verify'){","}else if(mode==='login'){");
  assert.match(segment,/const \{data,error\}=await supabase\.auth\.verifyOtp\(/);
  assert.match(segment,/type:'signup'/);
  assert.match(segment,/if\(error\)throw error;/);
  assert.match(segment,/if\(!data\?\.session\|\|!data\?\.user\?\.email_confirmed_at\)/);
  assert.ok(segment.indexOf('if(!data?.session||!data?.user?.email_confirmed_at)')<
            segment.indexOf('resumeAfterVerifiedEmailSession();'));
});

test('confirmed-email password login must have a real Supabase Auth session before EKODI handoff',()=>{
  const segment=between("}else if(mode==='login'){","}else{");
  assert.match(segment,/supabase\.auth\.signInWithPassword\(\{email:address,password:secret\}\)/);
  assert.match(segment,/if\(error\)throw error;/);
  assert.match(segment,/if\(!data\?\.session\|\|!data\?\.user\?\.email_confirmed_at\)/);
  assert.ok(segment.indexOf('if(!data?.session||!data?.user?.email_confirmed_at)')<
            segment.indexOf('resumeAfterVerifiedEmailSession();'));
});

test('fail-closed signup requires confirm email; SMTP delivery and backend readiness remain three independent gates',()=>{
  assert.match(source,/if\(readiness\.enabled!==true\)return false/);
  assert.match(source,/if\(data\?\.session\)\{/);
  const server=readFileSync(new URL('../supabase/functions/identity-api/index.ts',import.meta.url),'utf8');
  for(const key of ['EKODI_EMAIL_PASSWORD_ENABLED','EKODI_AUTH_EMAIL_CONFIRM_VERIFIED','EKODI_AUTH_SMTP_VERIFIED'])
    assert.ok(server.includes(key));
  assert.match(server,/if\(!user\.email_confirmed_at\)return json/);
});
