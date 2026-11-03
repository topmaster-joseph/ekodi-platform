import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../auth-site/client-auth.js',import.meta.url),'utf8');

test('EKODI identity login preserves the exact Tax admin callback',()=>{
  assert.match(source,/function trustedAdminCallbackReturn\(target\)/);
  assert.match(source,/\['\/tax','\/tax\/'\]\.includes\(nested\.pathname\)/);
  assert.match(source,/\['invoices','suppliers','customers','ledger'\]\.includes\(nested\.searchParams\.get\('tab'\)\)/);
  assert.match(source,/const adminReturn=trustedAdminCallbackReturn\(target\)/);
});

test('Tax callback allowlist rejects credentials, fragments, and unrelated query keys',()=>{
  assert.match(source,/nested\.username\|\|nested\.password\|\|nested\.hash/);
  assert.match(source,/every\(key=>key==='tab'\)/);
  assert.doesNotMatch(source,/startsWith\('https:\/\/ekodi\.kr\/tax/);
});
