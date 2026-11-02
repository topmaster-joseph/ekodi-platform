import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {maskLoginEmail,requireMutationReason,mutationGate,recentStepUp,siteMayView} from '../supabase/functions/identity-api/admin-person-security.ts';

const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const base={platform:true,recentGoogle:true,reason:'고객의 직접 요청',activeCount:2,isPrimary:false};

test('only platform administrator may mutate; site administrators can only read',()=>{
  assert.deepEqual(mutationGate({...base,platform:false}),{status:403,error:'platform_admin_required'});
  const code=read('supabase/functions/identity-api/admin-persons.ts');
  assert.match(code,/if\(!scope\.platform\)return json\(req,\{error:"platform_admin_required"\},403\)/);
  assert.match(code,/scope\.siteKeys/);
});
test('last and primary login identities cannot be unlinked',()=>{
  assert.deepEqual(mutationGate({...base,activeCount:1}),{status:409,error:'last_identity_cannot_disconnect'});
  assert.deepEqual(mutationGate({...base,isPrimary:true}),{status:409,error:'primary_identity_cannot_disconnect'});
});
test('required reason rejects missing and abbreviated reasons',()=>{
  assert.equal(requireMutationReason(''),null);
  assert.equal(requireMutationReason('no'),null);
  assert.equal(requireMutationReason(' 정상적인 해제 요청 '),'정상적인 해제 요청');
  assert.deepEqual(mutationGate({...base,reason:null}),{status:400,error:'reason_required'});
});
test('Google step-up must be fresh, not browser-supplied',()=>{
  const now=Date.now();
  assert.equal(recentStepUp(now-14*60_000,now),true);
  assert.equal(recentStepUp(now-15*60_000,now),false);
  assert.equal(recentStepUp(now+1000,now),false);
  assert.deepEqual(mutationGate({...base,recentGoogle:false}),{status:401,error:'google_step_up_required'});
  const api=read('supabase/functions/identity-api/admin-persons.ts');
  assert.match(api,/\.eq\("provider_subject",profile\.subject\)/);
  assert.match(api,/\.eq\("verified_person_id"|verified_person_id:|verified_person_id===personId/);
});
test('site scope cannot show another tenant member',()=>{
  assert.equal(siteMayView({userIds:['u2'],verifiedEmails:['outside@example.org']},{userIds:['u1'],emails:['member@example.org']}),false);
  assert.equal(siteMayView({userIds:['u2'],verifiedEmails:['member@example.org']},{userIds:['u1'],emails:['member@example.org']}),true);
});
test('email masking is enforced by server response',()=>{
  assert.equal(maskLoginEmail('topmaster.joseph@gmail.com'),'to****@gmail.com');
  assert.equal(maskLoginEmail('a@naver.com'),'a****@naver.com');
  assert.match(read('supabase/functions/identity-api/admin-persons.ts'),/email:maskLoginEmail\(row\.email\)/);
});
test('audit reason stored atomically; financial records never updated',()=>{
  const migration=read('supabase/migrations/20261102083500_admin_member_login_methods.sql');
  assert.match(migration,/identity\.admin_disconnected/);
  assert.match(migration,/identity\.admin_merge_reverted/);
  assert.match(migration,/jsonb_build_object\('reason',btrim\(p_reason\)/);
  assert.match(migration,/for update/);
  assert.doesNotMatch(migration,/update\s+public\.(payments|subscriptions|points|wallets)/i);
  assert.match(migration,/revoke all on function public\.admin_disconnect_person_identity/);
  assert.match(migration,/revoke all on function public\.admin_person_merge_revert/);
});
test('old bypass mutation path returns 410 and new routes provide rights checks',()=>{
  const access=read('supabase/functions/access-api/index.ts');
  const api=read('supabase/functions/identity-api/admin-persons.ts');
  assert.match(access,/use_identity_api_with_step_up/);
  assert.doesNotMatch(access,/admin\.rpc\("person_merge_revert"/);
  assert.ok(api.includes('/admin\\/merge-requests') || api.includes('admin\\/merge-requests'));
  assert.ok(api.includes('admin\\/identities'));
  assert.match(api,/if\(!scope\.platform\)/);
});
test('admin registry, asset routing, and user link handoff exist',()=>{
  assert.match(read('admin-menu-registry.js'),/회원 로그인 수단/);
  assert.match(read('site-worker.js'),/member-login-methods-admin\.js/);
  assert.match(read('member-login-methods-admin.js'),/https:\/\/ekodi\.kr\/auth\/\?manage=1/);
});
