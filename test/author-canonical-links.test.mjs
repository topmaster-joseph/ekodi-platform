import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const worker=readFileSync(new URL('../author-worker.js',import.meta.url),'utf8');
const app=readFileSync(new URL('../author/app.js',import.meta.url),'utf8');

test('Creator AI redirects legacy worker navigation to canonical ekodi.kr paths',()=>{
  assert.ok(worker.includes("https://ekodi.kr/admin/?route=books&source=author"));
  assert.ok(worker.includes("https://ekodi.kr/books/"));
  assert.ok(worker.includes("https://ekodi.kr/my/"));
  assert.ok(worker.includes("https://ekodi.kr/community/"));
  assert.doesNotMatch(worker, /(?:admin|auth|books)[.]ekodi[.]kr/, 'retired worker subdomains must not appear');
});
test('Creator AI login and CSP form actions support the primary-domain route',()=>{
  assert.match(app,/const LOGIN_URL = 'https:\/\/ekodi[.]kr\/auth\/\?site=author&return_to=/);
  assert.ok(worker.includes("form-action 'self' https://ekodi.kr https://*.tosspayments.com"));
  assert.ok(worker.includes("frame-ancestors 'none'"));
  assert.ok(worker.includes("Referrer-Policy"));
});
