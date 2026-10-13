import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../scripts/admin-authenticated-e2e-menu-worker.mjs',import.meta.url),'utf8');

test('canonical authenticated browser ready-token failures are categorized without URL or secret data',()=>{
  assert.match(src,/async function safeAuthHandoffDiagnostic\(\)/);
  assert.match(src,/location\.hostname==='ekodi\.kr'/);
  assert.match(src,/surface,storageReadable,tokenPresent/);
  assert.match(src,/appVisible:document\.querySelector/);
  assert.match(src,/loginVisible:document\.querySelector/);
  assert.match(src,/bootReady:document\.documentElement\.dataset\.ekodiAdminReady==='true'/);
  assert.match(src,/documentStatus:lastDocumentStatus/);
  assert.match(src,/console\.warn\('\[E2E:'\+menuId\+'\] ready-token-diagnostic '\+JSON\.stringify\(safe\)\)/);
  assert.match(src,/throw new Error\('READY_TOKEN_TIMEOUT'\)/);
});

test('protected E2E diagnostic does not include credential-bearing URL fields',()=>{
  const start=src.indexOf('async function safeAuthHandoffDiagnostic()');
  const end=src.indexOf('async function waitForReady()',start);
  const diagnostic=src.slice(start,end);
  assert.ok(start>=0&&end>start);
  for(const forbidden of ['location.href','location.search','location.hash','page.url()','window.localStorage','Authorization','JSON.stringify(token)']) {
    assert.ok(!diagnostic.includes(forbidden),forbidden);
  }
  assert.ok(diagnostic.includes("surface:'unavailable'"));
  assert.match(src,/page\.on\('response',response=>\{if\(response\.request\(\)\.resourceType\(\)==='document'\)lastDocumentStatus=response\.status\(\);\}\)/);
});
