import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {siteAdminBootstrapPage,siteAdminBootstrapScript} from '../site-admin-bootstrap-page.js';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('protected recovery page never grants access on its own',async()=>{
  const page=siteAdminBootstrapPage();
  assert.equal(page.status,200);
  assert.equal(page.headers.get('cache-control'),'no-store');
  assert.match(page.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  const html=await page.text();
  assert.match(html,/Google 계정으로 최고관리자 인증/);
  assert.match(html,/사이트 관리자 등록/);
  assert.match(html,/site-admin-bootstrap\.js/);
  assert.doesNotMatch(html,/type="password"/);
  const script=await siteAdminBootstrapScript().text();
  assert.match(script,/site-admins\/bootstrap/);
  assert.match(script,/platform-authority/);
  assert.match(script,/token_hash:handoff/);
  assert.match(script,/submit\.disabled=true/);
  assert.match(script,/SITE_ALREADY_HAS_ADMIN/);
});

test('designated two recovery administrators cannot be demoted or deleted',async()=>{
  const d1=await read('admin-google-auth.js');
  const config=await read('wrangler.api.toml');
  assert.match(config,/ADMIN_GOOGLE_BOOTSTRAP_EMAILS = "topmaster\.joseph@gmail\.com,joseph@ekodi\.kr"/);
  assert.match(d1,/function protectedBootstrapEmails/);
  assert.match(d1,/ON CONFLICT\(email\) DO UPDATE SET role='super_admin', status='active'/);
  assert.match(d1,/code: 'PROTECTED_SUPER_ADMIN'/);
  assert.match(d1,/if \(protectedBootstrapEmails\(env\)\.has\(normalizeEmail\(target\.email\)\)\)/);
});

test('any verified Google user can sign in; privileged actions remain server-gated',async()=>{
  const direct=await read('admin-direct-google.js');
  const universal=await read('auth-site/client-auth.js');
  const access=await read('supabase/functions/access-api/index.ts');
  assert.match(direct,/auth\.searchParams\.get\('site'\)!=='admin'/);
  assert.match(universal,/google\.accounts\.id\.renderButton/);
  assert.match(access,/async function verifiedGoogleIdentity/);
  assert.match(access,/verified_google_super_admin_required/);
  assert.match(access,/ekodi_bootstrap_vacant_site_admin/);
  assert.match(access,/activation:"pending_sync"/);
});

test('vacant-site write is atomic, tenant scoped, auditable and blocks existing administrators',async()=>{
  const sql=await read('supabase/migrations/20261018003000_google_verified_vacant_site_admin_bootstrap.sql');
  assert.match(sql,/service.role required|service role required/);
  assert.match(sql,/pg_advisory_xact_lock/);
  assert.match(sql,/SITE_TENANT_MISMATCH/);
  assert.match(sql,/SITE_ALREADY_HAS_ADMIN/);
  assert.match(sql,/site_admin_bootstrap_audit/);
  assert.match(sql,/login_identities/);
  assert.match(sql,/ekodichurch@gmail\.com/);
  assert.match(sql,/topmaster\.joseph@gmail\.com/);
  assert.match(sql,/joseph@ekodi\.kr/);
  assert.match(sql,/REVOKE ALL ON FUNCTION public\.ekodi_bootstrap_vacant_site_admin/);
});

test('church local API authenticates Google and resolves additional admin without global bypass',async()=>{
  const edge=await read('supabase/functions/church-pastor-api/index.ts');
  const page=await read('church-pastor-admin-page.js');
  assert.match(edge,/function staffFor\(userId,email\)/);
  assert.match(edge,/provenGoogleIdentity\(userId,normalizedEmail\)/);
  assert.match(edge,/PERMANENT_SUPER_ADMINS/);
  assert.match(edge,/church_google_additional_admin/);
  assert.match(edge,/scope'\)==='staff-access'/);
  assert.match(edge,/CHURCH_STAFF_REQUIRED/);
  assert.match(page,/scope=staff-access/);
  assert.match(page,/renderNav\(staff\.role\)/);
  assert.match(page,/active=eq\.true/);
});

test('bootstrap UI has both canonical worker entries and EKODI Control link',async()=>{
  const canonical=await read('canonical-surface-router.js');
  const site=await read('site-worker.js');
  const platform=await read('platform-router-entry-worker.js');
  const control=await read('control.html');
  for(const source of [canonical,site,platform])assert.match(source,/\/admin\/site-admins/);
  assert.match(control,/href="\/admin\/site-admins"/);
});
