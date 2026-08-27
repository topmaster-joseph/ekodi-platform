import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const client = read('auth-site/client-auth.js');
const identity = read('supabase/functions/identity-api/index.ts');
const manifest = read('ekodi-service-manifest.js');
const shell = read('shell/shell.js');
const membership = JSON.parse(read('config/universal-membership.json'));

test('common-service guest pages are guide-only until Google FREE membership', () => {
  assert.equal(membership.guestAccess?.mode, 'guide_only');
  assert.equal(membership.guestAccess?.minimumTierForContent, 'free');
  assert.match(manifest, /guestMode:'guide-only'/);
  assert.match(manifest, /operatingModel==='customer-site'\?null:COMMON_USER_ACCESS_POLICY/);
  assert.match(shell, /Google로 무료 시작/);
  assert.match(shell, /capabilitySummary/);
  assert.match(shell, /guestPublicException/);
});
test('ordinary common-service members land in My EKODI while platform admins keep original return', () => {
  assert.match(client, /const commonServiceEntry=config\.operatingModel==='shared-service'/);
  assert.match(client, /new URL\('https:\/\/my\.ekodi\.kr\/'\)/);
  assert.match(client, /commonServiceEntry&&proof\.platformAdmin!==true/);
  assert.match(client, /target\.searchParams\.set\('from',site\)/);
  assert.match(identity, /async function platformAdminForUser/);
  assert.match(identity, /select\("platform_admin"\)/);
  assert.match(identity, /platformAdmin,user/);
});

test('workspace selector stays hidden before an authenticated service session', () => {
  assert.match(shell, /function workspaceUiAvailable\(\)/);
  assert.match(shell, /ekodiWorkspaceSelector=available\?'member':'hidden'/);
  assert.match(shell, /\.pill\[hidden\]\{display:none!important\}/);
});
