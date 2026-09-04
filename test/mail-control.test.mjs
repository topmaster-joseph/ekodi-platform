import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Mail control is tenant-scoped, provider-neutral and seeds the EKODI Church forwarding intent', async () => {
  const control = await read('mail-control.js');
  assert.match(control, /current_site_activity_contexts/);
  assert.match(control, /workspace_id TEXT NOT NULL/);
  assert.match(control, /mail_control_audit/);
  assert.match(control, /forward-email/);
  assert.match(control, /mx1\.forwardemail\.net/);
  assert.match(control, /destinationVisibleInPublicDns/);
  assert.match(control, /ekodichurch\.kr/);
  assert.match(control, /ekodichurch@gmail\.com/);
  assert.match(control, /'joseph'/);
  assert.match(control, /outbound_status TEXT NOT NULL DEFAULT 'not_configured'/);
  assert.match(control, /send_enabled INTEGER NOT NULL DEFAULT 0/);
  assert.doesNotMatch(control, /GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY/);
});

test('Control API exposes mail control before generic OPTIONS routing', async () => {
  const api = await read('api-worker.js');
  assert.match(api, /import \{ handleMailControl \} from '\.\/mail-control\.js'/);
  const mail = api.indexOf("url.pathname.startsWith('/api/mail/control')");
  const options = api.indexOf("if (request.method === 'OPTIONS') return authWorker.fetch", mail);
  assert.ok(mail > 0 && options > mail, 'mail control must handle its own CORS preflight');
  assert.match(api, /await handleMailControl\(request, env\)/);
});

test('Workspace admin includes tenant-local Mail management under the canonical org path', async () => {
  const admin = await read('workspace-admin-page.js');
  assert.match(admin, /\['mail','메일'\]/);
  assert.match(admin, /api\.ekodi\.kr\/api\/mail\/control/);
  assert.match(admin, /ekodi-workspace-admin-session/);
  assert.match(admin, /\/api\/auth\/exchange/);
  assert.match(admin, /'ekodi-church':'에코디교회'/);
  assert.match(admin, /DNS 다시 확인/);
  assert.match(admin, /발신 미설정/);
  assert.match(admin, /isWorkspaceAdminPath/);
});

test('Mail schema migration stays additive and does not seed a guessed immutable workspace id', async () => {
  const migration = await read('migrations/0050_mail_control.sql');
  assert.match(migration, /CREATE TABLE IF NOT EXISTS mail_domains/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS mail_routes/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS mail_control_audit/);
  assert.doesNotMatch(migration, /INSERT\s+INTO\s+mail_domains/i);
});

test('Mail admin is a central projection of personal and workspace authority', async () => {
  const [control, page, router] = await Promise.all([read('mail-control.js'), read('mail-admin-page.js'), read('platform-router-entry-worker.js')]);
  assert.match(control, /CREATE TABLE IF NOT EXISTS mail_accounts/);
  assert.match(control, /owner_type TEXT NOT NULL CHECK\(owner_type IN \('person','workspace'\)\)/);
  assert.match(control, /authorityModel:'mail-admin-projects-existing-person-and-workspace-authority'/);
  assert.match(control, /pending_oauth/);
  assert.match(control, /credential_ref TEXT NOT NULL DEFAULT ''/);
  assert.match(page, /통합 메일 관리/);
  assert.match(page, /내 개인 메일/);
  assert.match(page, /기관 메일 도메인·주소 상세설정/);
  assert.match(page, /refresh token은 이 화면이나 계정 레지스트리에 평문 저장하지 않습니다/);
  assert.match(router, /url\.pathname==='\/admin'\)return mailAdminPage\(\)/);
});

test('Mail account content rights are separate from workspace administration', async () => {
  const [control, migration] = await Promise.all([read('mail-control.js'), read('migrations/0050_mail_control.sql')]);
  assert.match(control, /mail_account_grants/);
  assert.match(control, /can_read/);
  assert.match(control, /can_send/);
  assert.match(control, /can_manage/);
  assert.match(control, /permissions:\{read:/);
  assert.match(control, /mail_account_audit/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS mail_account_grants/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS mail_account_audit/);
});

test('Mail credentials are encrypted separately from account registry and OAuth state is signed', async () => {
  const [{ encryptMailCredential, decryptMailCredential, signMailState, readMailState }, control, migration] = await Promise.all([import('../mail-credential-vault.js'), read('mail-control.js'), read('migrations/0050_mail_control.sql')]);
  const env={MAIL_CREDENTIAL_KEY:'test-key-not-production'};const encrypted=await encryptMailCredential(env,{refreshToken:'secret-token'});
  assert.notEqual(encrypted.ciphertext,'secret-token');assert.equal((await decryptMailCredential(env,{credential_ciphertext:encrypted.ciphertext,credential_iv:encrypted.iv})).refreshToken,'secret-token');
  const state=await signMailState(env,{accountId:7,exp:Date.now()+1000});assert.equal((await readMailState(env,state)).accountId,7);
  assert.match(control,/CREATE TABLE IF NOT EXISTS mail_credentials/);assert.match(control,/CREATE TABLE IF NOT EXISTS mail_oauth_states/);
  assert.match(migration,/CREATE TABLE IF NOT EXISTS mail_credentials/);assert.match(migration,/CREATE TABLE IF NOT EXISTS mail_oauth_states/);
  assert.doesNotMatch(control,/credential_ciphertext.*refreshToken/);
});

test('Gmail adapter uses incremental least-privilege scopes and account-bound inbox routes', async () => {
  const [{ scopesForCapability, GMAIL_READ_SCOPE, GMAIL_SEND_SCOPE }, control, user, admin] = await Promise.all([import('../mail-google-adapter.js'),read('mail-control.js'),read('mail-user-page.js'),read('mail-admin-page.js')]);
  assert.ok(scopesForCapability('read').includes(GMAIL_READ_SCOPE));assert.ok(!scopesForCapability('read').includes(GMAIL_SEND_SCOPE));
  assert.ok(scopesForCapability('send').includes(GMAIL_SEND_SCOPE));assert.ok(!scopesForCapability('send').includes(GMAIL_READ_SCOPE));
  assert.ok(control.includes('googleConnectMatch'));assert.match(control,/MAIL_READ_FORBIDDEN/);assert.match(control,/MAIL_SEND_FORBIDDEN/);
  assert.match(user,/전체 받은편지함/);assert.match(user,/connectionStatus==='connected'/);assert.match(user,/accountLabel/);
  assert.match(admin,/Gmail 읽기 연결/);assert.match(admin,/발송 권한 추가/);assert.match(admin,/내 권한 저장/);
});

test('Custom-domain aliases remain identities under source inboxes instead of duplicate mailbox tabs', async () => {
  const [control,user]=await Promise.all([read('mail-control.js'),read('mail-user-page.js')]);
  assert.match(control,/lower\(r\.destination_email\)=lower\(\?\)/);assert.match(control,/aliases/);
  assert.match(user,/연결 주소/);assert.doesNotMatch(user,/joseph@ekodichurch\.kr.*tab/i);
});
