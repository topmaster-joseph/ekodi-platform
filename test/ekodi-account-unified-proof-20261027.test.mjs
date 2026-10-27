import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// 2026-10-27: any login path (Google, Naver, Kakao …) is the same EKODI account.
// Gates ask the account, never "is this session a Google identity".
const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
const migration=read('supabase/migrations/20261027120000_ekodi_account_unified_proof.sql');
const identityApi=read('supabase/functions/identity-api/index.ts');

test('account proof is additive and exposed only to the service role',()=>{
  assert.match(migration,/add column if not exists email_verified boolean not null default true/);
  assert.match(migration,/create or replace function public\.ekodi_account_for_auth_user\(p_auth_user_id uuid\)/);
  assert.match(migration,/revoke all on function public\.ekodi_account_for_auth_user\(uuid\) from public, anon, authenticated;/);
  assert.match(migration,/grant execute on function public\.ekodi_account_for_auth_user\(uuid\) to service_role;/);
  assert.doesNotMatch(migration.replace(/--[^\n]*/g,''),/\bdrop\s+(table|column)\b/i);
});

test('only verified, non-alias emails become account emails',()=>{
  assert.match(migration,/and li\.email_verified/);
  assert.match(migration,/li\.email !~\* '\^identity\\\+\[a-z0-9_-\]\+\\\.\[0-9a-f\]\{32\}@ekodi\\\.kr\$'/);
  assert.match(migration,/or \(u\.email_confirmed_at is not null and lower\(u\.email\) = lower\(li\.email\)\)/);
});

test('email-keyed grants need a verified identity email',()=>{
  const sync=migration.slice(migration.indexOf('function public.sync_person_access'));
  assert.equal((sync.match(/email_verified/g)||[]).length>=3,true);
  assert.match(sync,/and source\.email_verified/);
});

test('vacant-site admin bootstrap trusts the EKODI account, not the login path',()=>{
  const fn=migration.slice(migration.indexOf('ekodi_bootstrap_vacant_site_admin'));
  assert.match(fn,/public\.ekodi_account_for_auth_user\(p_actor_user_id\)/);
  assert.doesNotMatch(fn,/li\.provider='google'/);
  assert.match(fn,/'VERIFIED_GOOGLE_SUPER_ADMIN_REQUIRED'/,'client-facing error codes stay stable');
});

test('identity-api records email verification and signs Naver/Kakao into the account session',()=>{
  assert.match(identityApi,/recordEmailVerification\(provider,profile\.subject,provider==="google"\|\|profile\.emailVerified===true\)/);
  assert.match(identityApi,/adapters\.get\(provider\)\?\.redirect\?await canonicalAccountSession\(personId,link\)/);
  assert.match(identityApi,/find\(\(r:any\)=>r\.is_primary\)\?\?rows\.find\(\(r:any\)=>r\.provider==="google"\)/);
  assert.match(identityApi,/accountEmail:verifiedEmails\[0\]\?\?null/);
  // Google path is unchanged: no canonical-session hop for Google logins.
  assert.match(identityApi,/:\{\.\.\.link,canonical:false\}/);
});

test('access-api and church-pastor-api read the account proof',()=>{
  const access=read('supabase/functions/access-api/index.ts');
  assert.match(access,/async function verifiedEkodiAccount/);
  assert.match(access,/\.eq\("email_verified",true\)/);
  const pastor=read('supabase/functions/church-pastor-api/index.ts');
  assert.match(pastor,/if\(verified\.length&&!verified\.includes\(email\)\)email=verified\[0\]/);
});

test('store and merchant portals accept any login path of a registered EKODI account',()=>{
  const portal=read('customer-federated-auth.js');
  assert.match(portal,/identity-api\/identities/);
  assert.match(portal,/data\?\.person\?\.verifiedEmails/);
  assert.match(portal,/async function findGrant\(db, tenantId, identity\)/);
  assert.match(portal,/email: normalizeEmail\(grant\.email\)/);
  assert.doesNotMatch(portal,/이 Google 계정은 해당 고객/);
  // The legacy customer password endpoint stays disabled at the entry worker.
  assert.match(read('customer-entry-worker.js'),/LEGACY_CUSTOMER_PASSWORD_PATHS = new Set\(\['\/api\/customer\/login'\]\)/);
});
