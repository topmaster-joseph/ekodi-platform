import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const control = await readFile(new URL('../google-drive-storage-control.js', import.meta.url), 'utf8');
const worker = await readFile(new URL('../storage-worker.js', import.meta.url), 'utf8');
const config = await readFile(new URL('../wrangler.storage.toml', import.meta.url), 'utf8');
const siteConfig = await readFile(new URL('../wrangler.site.toml', import.meta.url), 'utf8');
const siteWorker = await readFile(new URL('../site-worker.js', import.meta.url), 'utf8');
const accessScript = await readFile(new URL('../scripts/ensure-storage-access.mjs', import.meta.url), 'utf8');
const migration = await readFile(new URL('../migrations/0038_google_drive_storage.sql', import.meta.url), 'utf8');
const admin = await readFile(new URL('../storage-admin.js', import.meta.url), 'utf8');
const cheonggyeAdmin = await readFile(new URL('../cheonggye-members-admin.js', import.meta.url), 'utf8');
const manifest = await readFile(new URL('../deploy/manifests/storage.worker.json', import.meta.url), 'utf8');

test('Google Drive credentials are encrypted and never committed', () => {
  assert.match(control, /AES-GCM/);
  assert.match(control, /STORAGE_CREDENTIAL_KEY/);
  assert.doesNotMatch(config, /GOOGLE_DRIVE_CLIENT_SECRET\s*=\s*".+"/);
  assert.doesNotMatch(config, /STORAGE_CREDENTIAL_KEY\s*=\s*".+"/);
});

test('primary Drive is ekodi.kr organization-bound while secondary accounts remain possible', () => {
  assert.match(config, /STORAGE_PRIMARY_GOOGLE_DOMAINS = "ekodi\.kr"/);
  assert.doesNotMatch(config, /STORAGE_PRIMARY_GOOGLE_DOMAINS = "[^"]*ekodibiz\.kr/);
  assert.match(control, /role === 'secondary'/);
  assert.match(migration, /'primary','secondary'/);
  assert.match(admin, /secondary:'topmaster\.joseph@gmail\.com'/);
  assert.match(admin, /startOAuth\('secondary'\)/);
});

test('EKODI shared drive is pinned as the canonical primary archive root', () => {
  assert.match(config, /STORAGE_PRIMARY_SHARED_DRIVE_ID = "0ACM_FnMYWMFuUk9PVA"/);
  assert.match(config, /STORAGE_PRIMARY_SHARED_DRIVE_NAME = "EKODI"/);
  assert.match(control, /primarySharedDriveId/);
  assert.match(control, /isCanonicalSharedDrive/);
  assert.match(control, /archiveRoot = row\.drive_root_id/);
  assert.match(control, /findFolder\(access,route\.folder_name,archiveRoot\)/);
});

test('storage control supports shared drives and app-scoped writes', () => {
  assert.match(control, /drive\.file/);
  assert.match(control, /drive\.metadata\.readonly/);
  assert.match(control, /supportsAllDrives=true/);
  assert.match(control, /includeItemsFromAllDrives/);
  assert.match(control, /\/drives\?pageSize=100/);
});

test('admin browser uses same-origin Storage API and localized failure UX', () => {
  assert.match(admin, /const API='\/api\/control\/storage\/google'/);
  assert.match(admin, /credentials:'same-origin'/);
  assert.doesNotMatch(admin, /drive\.ekodi\.kr\/api\/control\/storage\/google/);
  assert.match(admin, /저장소 연결을 확인할 수 없습니다/);
  assert.match(admin, /t\('저장소','Storage'\)/);
});

test('successful Google Drive OAuth returns directly to the exact admin route without an intermediate success page', () => {
  assert.ok(admin.includes("function currentAdminReturnPath(){return `${location.pathname}${location.search}${location.hash}`;}"));
  assert.ok(admin.includes("JSON.stringify({role,returnTo:currentAdminReturnPath()})"));
  assert.ok(control.includes("const returnTo = safeAdminReturnPath(body.returnTo);"));
  assert.ok(control.includes("signState(env,{nonce,role,adminEmail:auth.session.email,returnTo,exp:exp.getTime()})"));
  assert.ok(control.includes("return adminRedirect(payload.returnTo);"));
  assert.ok(control.includes("status:303"));
  assert.ok(control.includes("target.origin !== ADMIN_ORIGIN"));
  assert.doesNotMatch(control, /return html\(`\$\{email\} 계정이 .*연결되었습니다.*`,true\)/s);
});
test('Storage brokers Marketing YouTube OAuth through the already-authorized Drive callback without exposing the client secret', () => {
  assert.match(control, /MARKETING_YOUTUBE_CALLBACK/);
  assert.match(control, /purpose:'marketing_youtube'/);
  assert.match(control, /storage_google_oauth_tickets/);
  assert.match(control, /startMarketingYouTubeOAuth/);
  assert.match(control, /consumeMarketingYouTubeTicket/);
  assert.match(control, /refreshGoogleAccessToken/);
  assert.match(worker, /startYouTubeOAuth/);
  assert.match(worker, /consumeYouTubeTicket/);
  assert.match(worker, /refreshAccessToken/);
  assert.doesNotMatch(config, /GOOGLE_DRIVE_CLIENT_SECRET\s*=\s*".+"/);
});

test('Admin Worker proxies Storage through a Cloudflare service binding', () => {
  assert.match(siteConfig, /\[\[services\]\]/);
  assert.match(siteConfig, /binding = "STORAGE"/);
  assert.match(siteConfig, /service = "ekodi-storage-control"/);
  assert.match(siteWorker, /ADMIN_STORAGE_PREFIX = '\/api\/control\/storage\/'/);
  assert.match(siteWorker, /env\.STORAGE\?\.fetch/);
  assert.match(siteWorker, /env\.STORAGE\.fetch\(request\)/);
  assert.match(siteWorker, /X-EKODI-Storage-Proxy', 'service-binding-v1'/);
});

test('Storage Access is exact-target fail-closed with a narrow OAuth callback bypass', () => {
  assert.match(accessScript, /const targetDomain = 'drive\.ekodi\.kr'/);
  assert.match(accessScript, /const callbackDomain = 'drive\.ekodi\.kr\/api\/control\/storage\/google\/callback'/);
  assert.match(accessScript, /destinations: \[\{ type: 'public', uri: target \}\]/);
  assert.match(accessScript, /appTargetsExact/);
  assert.match(accessScript, /cloudflare_account_member/);
  assert.match(accessScript, /decision: 'bypass'/);
  assert.match(accessScript, /include: \[\{ everyone: \{\} \}\]/);
  assert.match(accessScript, /broad or wildcard fallback is forbidden/);
  assert.doesNotMatch(accessScript, /toLowerCase\(\) === 'all workers'/);
});

test('storage worker handles CORS preflight before app auth and mirrors credentials on actual responses', () => {
  const optionsIndex = worker.indexOf("if(request.method==='OPTIONS')");
  const guardIndex = worker.indexOf('enforceEdgeSecurity(request,env)');
  assert.ok(optionsIndex >= 0 && guardIndex > optionsIndex, 'OPTIONS must be handled before app auth');
  assert.match(worker, /access-control-allow-credentials','true/);
  assert.match(worker, /access-control-allow-origin',origin/);
  assert.match(worker, /function withCors\(/);
  assert.match(config, /ALLOWED_ORIGINS = "https:\/\/admin\.ekodi\.kr,https:\/\/ekodi\.kr,https:\/\/my\.ekodi\.kr"/);
});

test('R2 binding is source-controlled so redeployments cannot drop it', () => {
  assert.match(config, /\[\[r2_buckets\]\]/);
  assert.match(config, /binding = "R2_BUCKET"/);
  assert.match(config, /bucket_name = "ekodi-storage"/);
});

test('canonical EKODI archive folders are source-controlled', () => {
  for (const folder of ['01_CORE','02_CHURCH','03_BIZ','04_BOOKS','05_COMMUNITY','06_WORK','07_EDUCATION','08_MEDIA','09_CAMP','99_BACKUP']) {
    assert.match(migration, new RegExp(folder));
  }
  assert.match(worker, /ekodi-storage-control/);
  assert.match(config, /drive\.ekodi\.kr/);
});

test('new storage worker may bootstrap exactly through explicit manifest opt-in', () => {
  assert.match(manifest, /"allowFirstDeploy": true/);
});


test('Cheonggye merchant members use Google Sheets as the single source of truth', () => {
  assert.match(control, /CHEONGGYE_SPREADSHEET_ID = '1NNYUFgkle_vzSvR-HWM6EVhvfd5qdgJmF2ZYbK9gtlo'/);
  assert.match(control, /CHEONGGYE_SHEET_NAME = '웹관리'/);
  assert.match(control, /auth\/spreadsheets/);
  assert.match(control, /sheets\.googleapis\.com\/v4\/spreadsheets/);
  assert.match(control, /cheonggye-members/);
  assert.match(control, /cheonggye_member_audit/);
  assert.match(cheonggyeAdmin, /\/api\/control\/storage\/google\/cheonggye-members/);
  assert.doesNotMatch(cheonggyeAdmin, /localStorage\.setItem/);
  assert.doesNotMatch(cheonggyeAdmin, /INITIAL_ROWS/);
});

test('Cheonggye realtime member path survives D1 read quota by using encrypted R2 credential cache', () => {
  assert.match(control, /CHEONGGYE_CONNECTION_CACHE_KEY = 'control\/cheonggye\/storage-connection\.json'/);
  assert.match(control, /readCheonggyeConnectionCache/);
  assert.match(control, /env\.R2_BUCKET\.get\(CHEONGGYE_CONNECTION_CACHE_KEY\)/);
  assert.match(control, /writeCheonggyeConnectionCache/);
  assert.match(control, /audit\/cheonggye-members/);
  assert.match(control, /const isCheonggyeRoute = url\.pathname\.startsWith/);
  assert.match(control, /if \(!isCheonggyeRoute\)/);
});

test('Cheonggye 웹관리 A:F contract preserves 비고 as column F', () => {
  assert.match(control, /name:String\(row\[4\]/);
  assert.match(control, /note:String\(row\[5\]/);
  assert.match(control, /member\.name,member\.note/);
  assert.match(cheonggyeAdmin, /name="note"/);
  assert.match(cheonggyeAdmin, /data-sort="note">비고/);
  assert.doesNotMatch(cheonggyeAdmin, /연락처/);
});

test('Cheonggye admin polling uses short-lived R2 auth validation cache instead of reading D1 every 15 seconds', () => {
  assert.match(control, /CHEONGGYE_ADMIN_SESSION_CACHE_PREFIX = 'control\/cheonggye\/admin-session\/'/);
  assert.match(control, /CHEONGGYE_ADMIN_SESSION_FRESH_MS = 5 \* 60 \* 1000/);
  assert.match(control, /CHEONGGYE_ADMIN_SESSION_STALE_MS = 30 \* 60 \* 1000/);
  assert.match(control, /outageFallbackAllowed/);
  assert.match(control, /b64url\(await sha256\(token\)\)/);
  assert.match(control, /writeCheonggyeAdminSessionCache/);
  assert.match(control, /env\.R2_BUCKET\.put\(key/);
  assert.match(control, /isCheonggyeRoute \? await cheonggyeAdminSession/);
  assert.match(control, /using bounded cached validation after D1 exception/);
});


test('Google storage automatically reconnects only when Google credentials require reauthorization', () => {
  assert.match(control, /GOOGLE_REAUTH_REQUIRED/);
  assert.match(control, /data\.error === 'invalid_grant'/);
  assert.match(control, /insufficient\.\*scope/i);
  assert.match(control, /reconnectRole:role/);
  assert.match(control, /login_hint/);
  assert.match(admin, /AUTO_RECONNECT_COOLDOWN_MS=5\*60\*1000/);
  assert.match(admin, /currentAdminReturnPath/);
  assert.match(admin, /accountHintedAuthorizeUrl/);
  assert.match(cheonggyeAdmin, /startAutoReconnect/);
  assert.match(cheonggyeAdmin, /GOOGLE_REAUTH_REQUIRED/);
  assert.match(cheonggyeAdmin, /returnTo:currentAdminReturnPath\(\)/);
});
