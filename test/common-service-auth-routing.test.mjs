import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const client = read('auth-site/client-auth.js');
const identity = read('supabase/functions/identity-api/index.ts');
const manifest = read('ekodi-service-manifest.js');
const shell = read('shell/shell.js');
const myWorker = read('my-worker.js');
const shellInjector = read('ekodi-shell-injector.js');
const membership = JSON.parse(read('config/universal-membership.json'));

test('common-service public pages stay visible as guide landings before Google FREE membership', () => {
  assert.equal(membership.guestAccess?.mode, 'guide_only');
  assert.equal(membership.guestAccess?.minimumTierForContent, 'free');
  assert.match(manifest, /guestMode:'public-guide'/);
  assert.match(manifest, /service\.defaultSurface==='public'\?COMMON_PUBLIC_ACCESS_POLICY:COMMON_USER_ACCESS_POLICY/);
  assert.match(manifest, /operatingModel==='customer-site'\?null:/);
  assert.match(shell, /p\.guestMode==='guide-only'/);
  assert.match(shell, /surface==='public'\|\|surface==='workspace'/);
  assert.match(shell, /Google로 무료 시작/);
  assert.match(shell, /capabilitySummary/);
  assert.match(shell, /guestPublicException/);
});

test('My EKODI root keeps its service-owned guest guide while private workspace routes stay shared-shell gated', () => {
  assert.match(shell, /memberGateMode!=='service-owned'/);
  assert.match(shellInjector, /data-ekodi-member-gate=/);
  assert.match(shellInjector, /options\?\.memberGate==='service-owned'/);
  assert.match(myWorker, /const shellSurface=route\?'workspace':'public'/);
  assert.match(myWorker, /const memberGate=route\?'shared':'service-owned'/);
  assert.match(myWorker, /injectEkodiShell\([\s\S]*?'my',shellSurface,\{memberGate\}\)/);
});

test('workspace common services remain member-gated while public services use service-owned guide UI', () => {
  assert.match(manifest, /const COMMON_USER_ACCESS_POLICY/);
  assert.match(manifest, /const COMMON_PUBLIC_ACCESS_POLICY/);
  assert.match(manifest, /enforcedBy:'service-ui-and-protected-api'/);
  assert.match(manifest, /userAccessPolicy: 'public-guide-workspace-member-content'/);
});

test('ordinary common-service members land in My EKODI while platform admins keep original return', () => {
  assert.match(client, /const commonServiceEntry=config\.operatingModel==='shared-service'/);
  assert.match(client, /new URL\('https:\/\/my\.ekodi\.kr\/'\)/);
  assert.match(client, /commonServiceEntry&&proof\.platformAdmin!==true/);
  assert.match(client, /target\.searchParams\.set\('from',site\)/);
  assert.match(identity, /async function platformAdminForUser/);
  assert.match(identity, /select\("platform_admin"\)/);
  assert.match(identity, /platformAdmin/);
  assert.match(identity, /user:\{email:profile\.email,name:profile\.displayName\}/);
  assert.match(identity, /ekodiId/);
});

test('workspace selector stays hidden before an authenticated service session', () => {
  assert.match(shell, /function workspaceUiAvailable\(\)/);
  assert.match(shell, /ekodiWorkspaceSelector=available\?'member':'hidden'/);
  assert.match(shell, /\.pill\[hidden\]\{display:none!important\}/);
});