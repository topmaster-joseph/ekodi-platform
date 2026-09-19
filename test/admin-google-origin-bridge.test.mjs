import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const admin=read('auth-site/admin-auth.js');
const bridge=read('auth-site/google-origin-bridge.js');
const html=read('auth-site/google-origin-bridge.html');
const router=read('platform-router-entry-worker.js');
const site=read('site-worker.js');
const build=read('scripts/build.mjs');
test('canonical admin auth resolves the Google origin bridge from the active identity environment',()=>{
  assert.match(admin,/GOOGLE_BRIDGE_ORIGIN=runtime\.authOrigin/);
  assert.match(admin,/window\.open\(target\.href,'ekodi_google_origin_bridge'/);
  assert.match(admin,/event\.origin!==GOOGLE_BRIDGE_ORIGIN/);
  assert.doesNotMatch(admin,/loadGoogleLibrary\(/);
});
test('bridge validates request and returns credential only to canonical EKODI',()=>{
  assert.match(bridge,/targetOrigin:'https:\/\/ekodi\.kr'/);
  assert.match(bridge,/clientId===EXPECTED_CLIENT/);
  assert.match(bridge,/window\.opener\.postMessage/);
  assert.match(html,/accounts\.google\.com\/gsi\/client/);
});
test('canonical auth path owns the Google bridge and legacy auth host is retired',()=>{
  assert.doesNotMatch(router,/auth\.ekodi\.kr/);
  assert.doesNotMatch(site,/auth\.ekodi\.kr/);
  assert.match(build,/google-origin-bridge\.html/);
  assert.match(admin,/new URL\('\/auth\/google-origin-bridge',GOOGLE_BRIDGE_ORIGIN\)/);
});