import test from 'node:test';
import assert from 'node:assert/strict';
import { tenantAdminCommandHomeScript } from '../tenant-admin-command-home.js';

test('tenant command home keeps bundler __name helper inside an isolated lexical scope',async()=>{
  const source=await (await tenantAdminCommandHomeScript()).text();
  assert.ok(source.startsWith('((__name)=>('));
  assert.ok(source.endsWith(')((target)=>target);'));
  assert.equal(source.includes('const __name='),false);
  assert.equal(source.includes('var __name='),false);
  assert.ok(source.includes('function client()'));
});

test('tenant command home generated script remains syntactically valid',async()=>{
  const source=await (await tenantAdminCommandHomeScript()).text();
  assert.doesNotThrow(()=>new Function(source));
});
