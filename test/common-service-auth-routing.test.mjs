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

test('common-service public pages stay fully visible before Google FREE membership', () => {
  assert.equal(membership.guestAccess?.mode, 'public_content');
  assert.equal(membership.guestAccess?.minimumTierForContent, 'guest');
  assert.equal(membership.guestAccess?.memberTierForPersonalization, 'free');
  assert.match(manifest, /guestMode:'public-guide'/);
  assert.match(manifest, /service\.defaultSurface==='public'\?COMMON_PUBLIC_ACCESS_POLICY:COMMON_USER_ACCESS_POLICY/);
  assert.match(manifest, /operatingModel==='customer-site'\?null:/);
  assert.match(shell, /p\.guestMode==='guide-only'/);
  assert.match(shell, /surface==='workspace'&&explicitWorkspace/);
  assert.match(shell, /pathname\.toLowerCase\(\)\.startsWith\('\/w\/'\)/);
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

test('common-service login returns to the initiating service and never uses My EKODI as a generic fallback', () => {
  assert.match(client, /function postLoginTarget\(\)/);
  assert.match(client, /const target=new URL\(RETURN_TO\)/);
  assert.match(client, /isPlatformMy&&!\['my','portal'\]\.includes\(site\)/);
  assert.match(client, /const target=postLoginTarget\(\)/);
  assert.doesNotMatch(client, /function myEntryTarget\(\)/);
  assert.doesNotMatch(client, /commonServiceEntry&&proof\.platformAdmin!==true/);
  assert.doesNotMatch(client, /로그인 후 일반회원은 My EKODI/);
  assert.match(identity, /async function platformAdminForUser/);
  assert.match(identity, /select\("platform_admin"\)/);
  assert.match(identity, /platformAdmin/);
});

test('workspace selector stays hidden before an authenticated service session', () => {
  assert.match(shell, /function workspaceUiAvailable\(\)/);
  assert.match(shell, /ekodiWorkspaceSelector=available\?'member':'hidden'/);
  assert.match(shell, /\.pill\[hidden\]\{display:none!important\}/);
});
