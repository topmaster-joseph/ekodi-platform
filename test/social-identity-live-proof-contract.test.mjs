import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const script = readFileSync(new URL('../scripts/admin-authenticated-e2e-menu-worker.mjs',import.meta.url),'utf8');
const body = script.split('async function verifySocialInventory(')[1]?.split("\ntry {\n  stage('browser');")[0] || '';

test('SOCIAL-ID-001 live verification uses existing authenticated Admin E2E path', () => {
  assert.ok(body.length>400);
  assert.match(script, /menuId === 'social-accounts'\) await verifySocialInventory\(/);
  assert.match(body, /verifyNormal\(tab, alreadyActive, started\)/);
  assert.match(body, /authenticatedStatus!==200/);
  assert.match(body, /guestStatus!==401/);
  assert.match(body, /noStoreCache!==true/);
  assert.match(body, /cache-control/);
  assert.match(body, /registrationEnabled!==false/);
  assert.match(body, /providerCount!==13/);
  assert.match(body, /uiProviderCount!==13/);
  assert.match(body, /storageReady/);
});

test('SOCIAL-ID-001 live probe never mutates user-owned accounts or leaks identifiers', () => {
  assert.match(body, /credentials:'omit'/);
  assert.match(body, /method:'GET'/);
  assert.doesNotMatch(body, /method:'POST'|method:'DELETE'|method:'PATCH'|method:'PUT'/);
  assert.doesNotMatch(body, /data\.accounts|data\.existingServiceConnections|token\)/);
  assert.match(body, /inventoryVerified:true,policyDisabled:true/);
});
