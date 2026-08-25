import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const control = await readFile(new URL('../google-drive-storage-control.js', import.meta.url), 'utf8');
const worker = await readFile(new URL('../storage-worker.js', import.meta.url), 'utf8');
const config = await readFile(new URL('../wrangler.storage.toml', import.meta.url), 'utf8');
const migration = await readFile(new URL('../migrations/0038_google_drive_storage.sql', import.meta.url), 'utf8');
const admin = await readFile(new URL('../storage-admin.js', import.meta.url), 'utf8');
const manifest = await readFile(new URL('../deploy/manifests/storage.worker.json', import.meta.url), 'utf8');

test('Google Drive credentials are encrypted and never committed', () => {
  assert.match(control, /AES-GCM/);
  assert.match(control, /STORAGE_CREDENTIAL_KEY/);
  assert.doesNotMatch(config, /GOOGLE_DRIVE_CLIENT_SECRET\s*=\s*".+"/);
  assert.doesNotMatch(config, /STORAGE_CREDENTIAL_KEY\s*=\s*".+"/);
});

test('primary Drive is organization-bound while secondary accounts remain possible', () => {
  assert.match(config, /ekodi\.kr,ekodibiz\.kr/);
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
