import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const control=readFileSync(new URL('../google-drive-storage-control.js',import.meta.url),'utf8');
const admin=readFileSync(new URL('../storage-admin.js',import.meta.url),'utf8');
const slice=(begin,end)=>{
  const a=control.indexOf(begin),b=control.indexOf(end,a+1);
  assert.ok(a>=0&&b>a,'Expected operation boundaries missing');
  return control.slice(a,b);
};

test('pending new Workspace OAuth cannot disable a working primary or replace Sheets cache',()=>{
  const callback=slice("if (url.pathname === \`${BASE}/callback\`","if (url.pathname === \`${BASE}/cheonggye-members/health\`");
  assert.match(callback,/email !== primaryAccountEmail\(env\)/);
  assert.match(callback,/VALUES\(\?,'google_drive',[^\n]*'connected'/);
  assert.doesNotMatch(callback,/UPDATE storage_connections SET status='disabled'/);
  assert.doesNotMatch(callback,/await writeCheonggyeConnectionCache\(env,\{id,status:'connected'/);
  assert.match(callback,/return adminRedirect\(payload\.returnTo\)/);
});

test('selecting canonical Drive requires exact authenticated Workspace account and real Drive Manager capability',()=>{
  const select=slice('const selectMatch=url.pathname.match','const bootstrapMatch=url.pathname.match');
  assert.match(select,/PRIMARY_WORKSPACE_ACCOUNT_REQUIRED/);
  assert.match(select,/primaryAccountEmail\(env\)/);
  assert.match(select,/selected\.capabilities\?\.canManageMembers===true/);
  assert.match(select,/selected\.capabilities\?\.canAddChildren===true/);
  assert.match(select,/selected\.type!=='shared-drive'/);
  assert.match(select,/PRIMARY_SHARED_DRIVE_MANAGER_REQUIRED/);
  assert.doesNotMatch(select,/UPDATE storage_routes SET folder_id=''/);
  assert.doesNotMatch(select,/UPDATE storage_connections SET status='disabled'/);
  assert.ok(select.indexOf('PRIMARY_SHARED_DRIVE_MANAGER_REQUIRED') <
    select.indexOf('UPDATE storage_connections SET drive_id='),'Manager check must precede DB mutation');
});

test('bootstrap first verifies canonical route parent, then rotates cache and disables former primary',()=>{
  const boot=slice('async function bootstrap(env, row)', 'export async function handleGoogleDriveStorageControl');
  assert.match(boot,/const existing = await findFolder\(access,route\.folder_name,archiveRoot\)/);
  assert.match(boot,/CANONICAL_STORAGE_ROUTE_PARENT_MISMATCH/);
  assert.ok(boot.indexOf('CANONICAL_STORAGE_ROUTE_PARENT_MISMATCH') <
    boot.indexOf("UPDATE storage_routes SET folder_id="));
  const handler=slice('const bootstrapMatch=url.pathname.match','const disconnectMatch=url.pathname.match');
  assert.match(handler,/PRIMARY_WORKSPACE_ACCOUNT_REQUIRED/);
  assert.match(handler,/PRIMARY_SHARED_DRIVE_REQUIRED/);
  assert.match(handler,/PRIMARY_SHARED_DRIVE_MANAGER_REQUIRED/);
  assert.match(handler,/await bootstrap\(env,row\)/);
  assert.match(handler,/status='disabled',updated_at=\? WHERE role='primary' AND id<>\?/);
  assert.ok(handler.indexOf('await bootstrap(env,row)') <
    handler.indexOf('await writeCheonggyeConnectionCache(env,readyRow)'));
  assert.ok(handler.indexOf('await writeCheonggyeConnectionCache(env,readyRow)') <
    handler.indexOf("UPDATE storage_connections SET status='disabled'"));
});
test('disconnect fails closed for the last working primary, and cache removal matches its own ID',()=>{
  const disconnect=slice('const disconnectMatch=url.pathname.match',"return json({error:'Google Drive Storage endpoint not found'}");
  assert.match(disconnect,/PRIMARY_DISCONNECT_REQUIRES_REPLACEMENT/);
  assert.ok(disconnect.indexOf('PRIMARY_DISCONNECT_REQUIRES_REPLACEMENT') <
    disconnect.indexOf("UPDATE storage_connections SET status='disabled'"));
  assert.match(disconnect,/cached\?\.id===row\.id/);
});
test('admin distinguishes connected-but-unverified from actual ready primary',()=>{
  assert.match(control,/const primary=connections\.find\(row=>row\.role==='primary'&&row\.status==='ready'\)/);
  assert.match(admin,/connection\.status==='connected'\?t\('연결됨 · 폴더 확인 필요','Connected · setup pending'\)/);
  assert.match(admin,/state\.primaryAccountMatched===true/);
});
