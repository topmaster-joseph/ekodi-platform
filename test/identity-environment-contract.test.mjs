import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const identity=JSON.parse(await read('config/identity-environments.json'));
const environments=JSON.parse(await read('config/ekodi-environments.json'));
const workflow=await read('.github/workflows/deploy-control-api.yml');
const backend=await read('admin-google-auth.js');
const mail=await read('mail-google-adapter.js');
const drive=await read('google-drive-storage-control.js');
const writer=await read('canonical-drive-writer.js');

test('production, staging and development identity clients are constitutionally isolated',()=>{
  assert.deepEqual(identity.environments.production.authorizedJavaScriptOrigins,['https://ekodi.kr']);
  assert.deepEqual(identity.environments.staging.authorizedJavaScriptOrigins,['https://staging.ekodi.kr']);
  assert.equal(new Set(Object.values(identity.environments).map(v=>v.googleClientBinding)).size,3);
  assert.equal(new Set(Object.values(identity.environments).map(v=>v.sessionNamespace)).size,3);
  assert.equal(environments.environments.staging.git.githubEnvironment,'staging');
  assert.equal(environments.environments.production.identity.canonicalOrigin,'https://ekodi.kr');
});

test('staging deployment receives a staging-only client and exact origin',()=>{
  const staging=workflow.match(/\n  staging:[\s\S]*?\n  production:/)?.[0]||'';
  assert.match(staging,/environment: staging/);
  assert.match(staging,/GOOGLE_STAGING_CLIENT_ID/);
  assert.match(staging,/GOOGLE_CLIENT_ID = "\$GOOGLE_STAGING_CLIENT_ID"/);
  assert.match(staging,/GOOGLE_IDENTITY_ORIGIN = "https:\/\/staging\.ekodi\.kr"/);
  assert.doesNotMatch(staging,/483044030492-4e6231l5glchhtniroinvuq3ev6n5mv5/);
});

test('Google sign-in API enforces the environment origin when the browser supplies Origin',()=>{
  assert.match(backend,/GOOGLE_IDENTITY_ORIGIN/);
  assert.match(backend,/IDENTITY_ORIGIN_MISMATCH/);
  assert.match(backend,/identityOrigin/);
});

test('Google service OAuth cannot silently reuse the sign-in client',()=>{
  assert.doesNotMatch(mail,/MAIL_GOOGLE_CLIENT_ID \|\| env\.GOOGLE_CLIENT_ID/);
  assert.doesNotMatch(drive,/GOOGLE_DRIVE_CLIENT_ID \|\| env\.GOOGLE_CLIENT_ID/);
  assert.doesNotMatch(writer,/GOOGLE_DRIVE_CLIENT_ID \|\| env\.GOOGLE_CLIENT_ID/);
  assert.equal(identity.serviceOAuth.genericIdentityClientFallbackForbidden,true);
});

test('provider migration state stays explicit until Google Console and channel reauthorization are complete',()=>{
  assert.equal(identity.providerMigration.productionOriginRegistration,'pending-google-console');
  assert.equal(identity.providerMigration.stagingIdentityClient,'pending-google-console');
  assert.equal(identity.providerMigration.driveDedicatedClientRotation,'pending-provider-reauthorization');
});
