import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL('../'+path,import.meta.url),'utf8');

const templates = [
  {path:'docs/auth/templates/ekodi-signup-confirmation.html',title:'EKODI 회원가입 확인'},
  {path:'docs/auth/templates/ekodi-password-recovery.html',title:'비밀번호 재설정 인증'},
];

test('EKODI Mail confirmation/recovery templates both carry the live Supabase numeric OTP token, not a magic link',()=>{
  for(const {path,title} of templates){
    const content=read(path);
    assert.match(content,/<html lang="ko">/);
    assert.ok(content.includes(title),path+' missing heading');
    assert.equal(content.split('{{ .Token }}').length-1,1,path+' must have exactly one OTP placeholder');
    assert.doesNotMatch(content,/\{\{\s*\.ConfirmationURL\s*\}\}/);
    assert.doesNotMatch(content,/<script\b/i);
    assert.doesNotMatch(content,/<form\b/i);
    assert.match(content,/https:\/\/ekodi\.kr\/auth\//);
    assert.match(content,/인증코드/);
  }
});

test('OTP templates do not substitute for actual Supabase Auth SMTP and confirmation validation',()=>{
  const runbook=read('docs/auth/EKODI-MAIL-EMAIL-SIGNUP-RELEASE.md');
  const api=read('supabase/functions/identity-api/index.ts');
  for(const gate of ['EKODI_EMAIL_PASSWORD_ENABLED','EKODI_AUTH_EMAIL_CONFIRM_VERIFIED','EKODI_AUTH_SMTP_VERIFIED']){
    assert.ok(runbook.includes(gate));
    assert.ok(api.includes(gate));
  }
  assert.match(runbook,/SPF\/DKIM\/DMARC/);
  assert.match(runbook,/Supabase/);
  assert.match(api,/emailPasswordReady\(\)/);
});
