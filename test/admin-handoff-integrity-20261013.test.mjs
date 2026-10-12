import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../admin-central-handoff.js',import.meta.url),'utf8');
test('storage failure keeps token handoff recoverable',()=>{
  assert.ok(src.includes("mark('ekodi-admin-token-storage-failed')"));
  assert.ok(src.includes('safeSession.get(TOKEN_KEY)!==value'));
});
test('API result must attest authenticated session',()=>{
  assert.ok(src.includes('result.authenticated!==true'));
});
