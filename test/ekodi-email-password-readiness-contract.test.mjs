import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const spec=read('docs/auth/EKODI-EMAIL-PASSWORD-ONBOARDING.md');
const boundary=read('docs/auth/EKODI-ID-LOGIN-CHANNEL-BOUNDARY.md');
const auth=read('docs/AUTH-CENTER.md');
const social=read('social-identity-control.js');
const identity=read('supabase/functions/identity-api/index.ts');
const emailProviders=read('docs/auth/FEDERATED-LOGIN-NAVER-KAKAO.md');

test('email/password acceptance retains one EKODI ID and no provider-email auto merge',()=>{
  for(const contract of ['EKODI Person','고유 EKODI ID','login_identities','ensure_person_identity',
    'ekodi_account_for_auth_user','/session/handoff','email_verified','Confirm Email'])
    assert.ok(spec.includes(contract),contract+' missing');
  assert.match(spec,/이메일이 같다는 이유만으로/);
  assert.match(boundary,/같은 이메일이라고 자동으로 같은 사람이라고 판단하지 않는다/);
  assert.match(auth,/people\.ekodi_id/);
});
test('password credentials remain only with the supported Auth service and never with channel registry',()=>{
  for(const expected of ['signUp({email,password})','signInWithPassword({email,password})',
    'resetPasswordForEmail(email)','updateUser({password})','비밀번호를 EKODI Worker나 D1'])
    assert.ok(spec.includes(expected),expected+' missing');
  assert.match(social,/socialLoginEnabled:false/);
  assert.doesNotMatch(social,/password_hash|password_digest|signInWithPassword|signUp\(/);
  assert.match(identity,/\/session\/handoff/);
  assert.match(spec,/출시 차단/);
  assert.match(spec,/운영 스위치.*닫아 둔다/);
});
test('provider switch observations are documented as runtime DB state, not live OAuth proof',()=>{
  for(const text of [spec,boundary,emailProviders]){
    assert.ok(/Kakao.*true|카카오.*true/.test(text), 'Kakao enabled DB snapshot required');
    assert.ok(/Naver.*false|네이버.*false/.test(text), 'Naver disabled DB snapshot required');
  }
  assert.match(auth,/Kakao 활성, Naver 비활성/);
  assert.match(spec,/키 설치나 성공 로그인까지 입증하지는 않는다/);
});
