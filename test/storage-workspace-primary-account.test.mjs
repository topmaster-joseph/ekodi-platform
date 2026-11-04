import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const control=read('google-drive-storage-control.js');
const admin=read('storage-admin.js');
const writer=read('canonical-drive-writer.js');
const prod=read('wrangler.storage.toml');
const dev=read('wrangler.storage.development.toml');
const policy=JSON.parse(read('config/storage-policy.json'));

test('canonical EKODI Drive remains the existing organisation-owned Shared Drive',()=>{
  assert.match(prod,/STORAGE_PRIMARY_SHARED_DRIVE_ID = "0ACM_FnMYWMFuUk9PVA"/);
  assert.match(prod,/STORAGE_PRIMARY_SHARED_DRIVE_NAME = "EKODI"/);
  assert.match(writer,/CANONICAL_STORAGE_DRIVE_MISMATCH/);
  assert.equal(policy.canonicalStore,'google_workspace_shared_drive');
  assert.equal(policy.canonicalPrimaryAccountEmail,'joseph@ekodi.kr');
  assert.equal(policy.personalAccountNotCanonical,true);
});

test('production and development primary OAuth identities are exact Workspace account only',()=>{
  assert.match(prod,/STORAGE_PRIMARY_GOOGLE_EMAIL = "joseph@ekodi.kr"/);
  assert.match(dev,/STORAGE_PRIMARY_GOOGLE_EMAIL = "joseph@ekodi.kr"/);
  assert.match(control,/function primaryAccountEmail\(env\)/);
  assert.match(control,/email !== primaryAccountEmail\(env\)/);
  const allowed=control.indexOf('email !== primaryAccountEmail(env)');
  const deactivate=control.indexOf('UPDATE storage_connections SET status=\'disabled\'');
  assert.ok(allowed>0&&deactivate>allowed,'Reject wrong account before altering previous stored connection');
  assert.match(control,/if\(role==='primary'&&primaryAccountEmail\(env\)\)params\.set\('login_hint',primaryAccountEmail\(env\)\)/);
});

test('admin exposes verified/mismatched status rather than treating a personal OAuth login as authoritative',()=>{
  assert.match(control,/primaryAccountMatched:Boolean\(expected&&primary&&/);
  assert.match(control,/primaryAccountEmail:expected/);
  assert.match(admin,/state\.primaryAccountMatched===true/);
  assert.match(admin,/기본 관리 계정 재연결 필요/);
  assert.match(admin,/primary:'joseph@ekodi\.kr'/);
  assert.doesNotMatch(prod,/STORAGE_PRIMARY_GOOGLE_EMAIL = "topmaster\.joseph@gmail\.com"/);
  assert.doesNotMatch(control,/\bownerRoleGranted\s*:\s*true\b/);
});
