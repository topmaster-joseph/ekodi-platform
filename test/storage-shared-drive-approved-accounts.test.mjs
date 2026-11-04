import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const prod=read('wrangler.storage.toml');
const dev=read('wrangler.storage.development.toml');
const policy=JSON.parse(read('config/storage-policy.json'));
const server=read('google-drive-storage-control.js');
const admin=read('storage-admin.js');
const accounts=['joseph@ekodi.kr','topmaster.joseph@gmail.com','ekodibiz@gmail.com'];

test('three explicit approved users and existing canonical drive, not public domain grants',()=>{
  assert.deepEqual(policy.canonicalSharedDriveApprovedAccounts.map(x=>x.email),accounts);
  assert.equal(policy.canonicalPrimaryAccountEmail,'joseph@ekodi.kr');
  assert.equal(policy.personalAccountNotCanonical,true);
  assert.match(policy.sharedDriveMembershipSourceOfTruth,/Google Drive permissions\.list/);
  for(const config of [prod,dev]){
    assert.match(config,/STORAGE_PRIMARY_GOOGLE_EMAIL = "joseph@ekodi\.kr"/);
    assert.match(config,/STORAGE_PRIMARY_SHARED_DRIVE_ID = "0ACM_FnMYWMFuUk9PVA"/);
    assert.match(config,/STORAGE_SHARED_DRIVE_APPROVED_EMAILS = "joseph@ekodi\.kr,topmaster\.joseph@gmail\.com,ekodibiz@gmail\.com"/);
    assert.doesNotMatch(config,/anyone_at_company|STORAGE_PRIMARY_GOOGLE_EMAIL = "topmaster/);
  }
  assert.equal(new Set(accounts).size,3);
});

test('OAuth request requires explicitly allowlisted identity when selecting a collaborator',()=>{
  assert.match(server,/function approvedSharedDriveEmails\(env\)/);
  assert.match(server,/new Set\(\[primaryAccountEmail\(env\),\.\.\.splitList\(env\.STORAGE_SHARED_DRIVE_APPROVED_EMAILS\)\]/);
  assert.match(server,/if\(accountHint&&!approvedSharedDriveEmails\(env\)\.includes\(accountHint\)\)/);
  assert.match(server,/code:'SHARED_DRIVE_ACCOUNT_NOT_APPROVED'/);
  assert.match(server,/signState\(env,\{nonce,role,accountHint,adminEmail/);
  assert.match(server,/payload\.role === 'secondary' && payload\.accountHint && email !== payload\.accountHint/);
  assert.match(server,/else if\(accountHint\)params\.set\('login_hint',accountHint\)/);
});

test('unapproved secondary OAuth cannot select canonical shared drive, steward identity unchanged',()=>{
  const begin=server.indexOf('const selectMatch=url.pathname.match');
  const end=server.indexOf('const bootstrapMatch=url.pathname.match',begin);
  const select=server.slice(begin,end);
  assert.ok(begin>0&&end>begin);
  assert.match(select,/row\.role==='secondary'&&selected\.id===primarySharedDriveId\(env\)/);
  assert.match(select,/!approvedSharedDriveEmails\(env\)\.includes\(String\(row\.account_email\|\|''\)/);
  assert.match(select,/SHARED_DRIVE_ACCOUNT_NOT_APPROVED/);
  assert.match(select,/row\.role==='primary'&&primaryAccountEmail\(env\)/);
  assert.match(server,/const primary=connections\.find\(row=>row\.role==='primary'&&row\.status==='ready'\)/);
});

test('authenticated administrator sees approved collaborators but without invented provider rights',()=>{
  assert.match(server,/approvedSharedDriveAccounts:approvedSharedDriveEmails\(env\)\.map/);
  assert.match(server,/googleMembershipVerification:'google_provider_source_of_truth'/);
  assert.match(admin,/function renderSharedDriveAccounts\(container\)/);
  assert.match(admin,/state\.approvedSharedDriveAccounts\|\|\[\]/);
  assert.match(admin,/startOAuth\('secondary',\{accountHint:entry\.email\}\)/);
  assert.match(admin,/role,accountHint,returnTo:currentAdminReturnPath\(\)/);
  assert.match(admin,/renderSharedDriveAccounts\(section\)/);
  assert.doesNotMatch(admin,/permissions\.create|grantManager|domainUsersOnly/);
});
