import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const admin=read('admin-google-auth.js');
const entry=read('customer-entry-worker.js');
const surface=read('auth-site/admin-auth.js');
const client=read('auth-site/client-auth.js');
const router=read('auth-site/auth-router.js');

test('multi-provider administrator bridge is disabled by default',()=>{
  assert.match(admin,/EKODI_ADMIN_FEDERATED_LOGIN_ENABLED/);
  assert.match(admin,/=== 'true'/);
  assert.match(admin,/if \(!ekodiAdminBridgeEnabled\(env\)\)/);
  assert.match(admin,/path === '\/api\/ekodi\/admin\/config'/);
  assert.match(admin,/path === '\/api\/ekodi\/admin\/challenge'/);
  assert.match(admin,/path === '\/api\/ekodi\/admin\/login'/);
  assert.match(entry,/path\.startsWith\('\/api\/ekodi\/admin\/'\)/);
});

test('a real user, one-time nonce and exact authorized origin are all required',()=>{
  assert.match(admin,/auth\/v1\/user/);
  assert.match(admin,/user\?\.email_confirmed_at/);
  assert.match(admin,/loadBillingIdentity\(/);
  assert.match(admin,/identity\.verifiedEmails/);
  assert.match(admin,/DELETE FROM ekodi_admin_login_challenges/);
  assert.match(admin,/RETURNING nonce_hash/);
  assert.match(admin,/ekodiSensitive && \(!origin \|\| !identityOrigin \|\| origin !== identityOrigin\)/);
});

test('super admin additionally requires independent server authority, no role from client',()=>{
  const start=admin.indexOf('async function handleEkodiAdminLogin(');
  const end=admin.indexOf('export async function handleAdminGoogleAuth(',start);
  const bridge=admin.slice(start,end);
  assert.match(bridge,/admin_google_accounts/);
  assert.match(bridge,/status='active'/);
  assert.match(bridge,/if \(row && !row\.required_hd\)/);
  assert.match(bridge,/account\.role === 'super_admin'/);
  assert.match(bridge,/access-api\/platform-authority/);
  assert.match(bridge,/authority\?\.platformAdmin !== true/);
  assert.match(bridge,/ensureAdminRow\(env\.DB,account\)/);
  assert.match(bridge,/issueSession\(env\.DB,admin\.id\)/);
  assert.doesNotMatch(bridge,/INSERT INTO admin_privileged_sessions/);
  assert.match(bridge,/session\.ekodi_login/);
});

test('alternative login is explicit, loops only through canonical auth and keeps D1 role check',()=>{
  assert.match(surface,/EKODI_BRIDGE_INTENT/);
  assert.match(surface,/getSession\(\)/);
  assert.match(surface,/\/api\/ekodi\/admin\/login/);
  assert.match(surface,/\/api\/session/);
  assert.match(surface,/verified\.authenticated!==true/);
  assert.match(surface,/site','portal'/);
  assert.match(surface,/site','admin'/);
  assert.match(surface,/via','ekodi'/);
  assert.match(surface,/return_to',safeReturn/);
  assert.match(surface,/sessionStorage\.removeItem\(EKODI_BRIDGE_INTENT\)/);
  assert.match(client,/const adminReturn=config\.kind==='portal'/);
  assert.match(client,/target\.pathname==='\/auth\/'/);
  assert.match(client,/target\.searchParams\.get\('via'\)==='ekodi'/);
  assert.match(router,/else if\(site==='admin'\)await import\('\.\/admin-auth\.js/);
});

test('no alternate account is accepted as a direct privileged session',()=>{
  assert.match(admin,/high-risk fresh Google step-up/);
  assert.match(admin,/const identitySensitive = path\.startsWith\('\/api\/google\/'\) \|\| ekodiSensitive/);
  assert.match(surface,/function navigateToAdmin\(result\)/);
  assert.match(admin,/const SESSION_HOURS = 8/);
  assert.doesNotMatch(admin,/raw_user_meta_data.*platform_admin/);
});

test('owner decision 2026-11-01: linked logins for operator screens, central admin console stays Google-only',async()=>{
  const {ekodiBridgeTargetsAdminConsole}=await import('../admin-google-auth.js');
  for(const target of ['https://ekodi.kr/admin/','https://ekodi.kr/admin','https://legacy.example/x','','javascript:alert(1)','https://evil.example/edu/'])
    assert.equal(ekodiBridgeTargetsAdminConsole(target),true,target);
  for(const target of ['https://ekodi.kr/edu/study/live/','https://ekodi.kr/cooperative/','https://ekodi.kr/administration-notes'])
    assert.equal(ekodiBridgeTargetsAdminConsole(target),false,target);
  assert.match(admin,/code:'ADMIN_CONSOLE_GOOGLE_ONLY'/);
  assert.match(surface,/if\(centralAdminConsoleTarget\(safeReturn\)\)return;/);
  assert.match(surface,/returnTo:safeReturn/);
  assert.match(read('wrangler.api.toml'),/EKODI_ADMIN_FEDERATED_LOGIN_ENABLED = "true"/);
  const app=read('my/app.js');
  assert.match(app,/kakao:'카카오·다음',naver:'네이버'/);
  assert.match(read('my/index.html'),/로그인 수단 관리 · 카카오·네이버·구글 추가/);
});
