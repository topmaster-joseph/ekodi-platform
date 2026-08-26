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
  assert.match(admin, /다른 Google 계정 추가/);
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

test('Admin Worker proxies Storage through a Cloudflare service binding', () => {
  assert.match(siteConfig, /\[\[services\]\]/);
  assert.match(siteConfig, /binding = "STORAGE"/);
  assert.match(siteConfig, /service = "ekodi-storage-control"/);
  assert.match(siteWorker, /ADMIN_STORAGE_PREFIX = '\/api\/control\/storage\/'/);
  assert.match(siteWorker, /env\.STORAGE\?\.fetch/);
  assert.match(siteWorker, /env\.STORAGE\.fetch\(request\)/);
  assert.match(siteWorker, /X-EKODI-Storage-Proxy', 'service-binding-v1'/);
});

test('Storage Access is exact-host fail-closed with a narrow OAuth callback bypass', () => {
  assert.match(accessScript, /const targetDomain = 'drive\.ekodi\.kr'/);
  assert.match(accessScript, /const callbackDomain = 'drive\.ekodi\.kr\/api\/control\/storage\/google\/callback'/);
  assert.match(accessScript, /type: 'self_hosted'/);
  assert.match(accessScript, /cloudflare_account_member/);
  assert.match(accessScript, /decision: 'bypass'/);
  assert.match(accessScript, /include: \[\{ everyone: \{\} \}\]/);
  assert.match(accessScript, /broad All Workers fallback is forbidden/);
  assert.doesNotMatch(accessScript, /find\(item => String\(item\.name \|\| ''\)\.toLowerCase\(\) === 'all workers'\)/);
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
