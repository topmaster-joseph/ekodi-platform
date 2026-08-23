import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const control = fs.readFileSync(new URL('../cloudflare-secret-control.js', import.meta.url), 'utf8');
const entry = fs.readFileSync(new URL('../mission-control-entry-worker.js', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../migrations/0035_cloudflare_secret_audit.sql', import.meta.url), 'utf8');


test('server generates cryptographic random values and never uses deployment token binding', () => {
  assert.match(control, /crypto\.getRandomValues\(bytes\)/);
  assert.doesNotMatch(control, /Math\.random/);
  assert.match(control, /CLOUDFLARE_SECRET_MANAGER_TOKEN/);
  assert.doesNotMatch(control, /env\.CLOUDFLARE_API_TOKEN/);
  assert.match(control, /valueReturned:false/);
});


test('Cloudflare secret write uses official script secrets endpoint and explicit approval', () => {
  assert.match(control, /api\.cloudflare\.com\/client\/v4\/accounts/);
  assert.match(control, /workers\/scripts\/\$\{script\}\/secrets/);
  assert.match(control, /method:'PUT'/);
  assert.match(control, /type:'secret_text'/);
  assert.match(control, /x-ekodi-confirm-impact/);
  assert.match(control, /cloudflare-secret-create/);
});


test('target scripts are allowlisted and existing secrets cannot be overwritten silently', () => {
  assert.match(control, /CLOUDFLARE_SECRET_ALLOWED_SCRIPTS/);
  assert.match(control, /\['ekodi-auth-api'\]/);
  assert.match(control, /secretExists/);
  assert.match(control, /SECRET_ALREADY_EXISTS/);
  assert.match(control, /body\?\.replace === true/);
  assert.match(control, /existingSecretRequiresExplicitReplace:true/);
});


test('secret-manager controller credentials cannot overwrite themselves', () => {
  assert.match(control, /RESERVED_NAMES/);
  assert.match(control, /'CLOUDFLARE_SECRET_MANAGER_TOKEN'/);
  assert.match(control, /'CLOUDFLARE_API_TOKEN'/);
  assert.match(control, /'CLOUDFLARE_ACCOUNT_ID'/);
  assert.match(control, /SECRET_NAME_RESERVED/);
  assert.match(control, /controllerCredentialsProtected:true/);
});


test('only configured top administrators may use secret manager', () => {
  assert.match(control, /SECRET_MANAGER_ADMIN_EMAILS/);
  assert.match(control, /ADMIN_GOOGLE_BOOTSTRAP_EMAILS/);
  assert.match(control, /SECRET_MANAGER_FORBIDDEN/);
  assert.match(control, /handleAdminSessionFastPath/);
});


test('secret manager is routed through secured control plane and audits metadata without secret text', () => {
  assert.match(entry, /handleCloudflareSecretControl/);
  assert.match(entry, /path\.startsWith\('\/api\/control\/secrets'\)/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS cloudflare_secret_audit/);
  assert.match(migration, /fingerprint TEXT/);
  assert.doesNotMatch(migration, /secret_value|secret_text|\bvalue\b/i);
});
