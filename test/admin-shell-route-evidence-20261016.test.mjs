import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src=readFileSync(new URL('../scripts/admin-authenticated-e2e-menu-worker.mjs',import.meta.url),'utf8');

test('missing Admin app reports only structural evidence and still fails closed',()=>{
  const begin=src.indexOf("  stage('ready-app');");
  const end=src.indexOf("  stage('ready-runtime');",begin);
  assert.ok(begin>0&&end>begin);
  const segment=src.slice(begin,end);
  assert.ok(segment.includes("await page.waitForSelector('#app:not([hidden])'"));
  for(const key of ['documentReadyState','appPresent','appHidden','loginPresent','coreLoaded','panelsLoaded'])assert.ok(segment.includes(key),key);
  assert.ok(segment.includes('throw error;'));
  for(const forbidden of ['sessionStorage','localStorage','document.cookie','innerHTML','outerHTML','location.href','location.search','response.text()'])assert.ok(!segment.includes(forbidden),'unexpected sensitive diagnostic: '+forbidden);
});

test('Admin entry identifies trusted Worker routing without dumping header values',()=>{
  const begin=src.indexOf('  adminEntryTransport = {');
  const end=src.indexOf('  if ([401, 403].includes(adminEntryTransport.status))',begin);
  assert.ok(begin>0&&end>begin);
  const segment=src.slice(begin,end);
  assert.ok(segment.includes('routeClass:'));
  assert.ok(segment.includes('canonicalSurface:'));
  assert.ok(segment.includes("'admin-fallback'"));
  assert.ok(segment.includes("'admin-shell'"));
  assert.ok(segment.includes("'admin' ? 'admin' : 'none'"));
  assert.ok(segment.includes("entryHeaders['cf-cache-status']"));
  assert.ok(!segment.includes('headers: entryHeaders'));
  assert.ok(!segment.includes('response.text()'));
  assert.ok(src.includes("if ([401, 403].includes(adminEntryTransport.status))"));
});
