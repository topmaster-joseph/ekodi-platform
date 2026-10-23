import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
test('retired public Invest admin is not discoverable or lazily mounted',async()=>{
 const layout=await readFile(new URL('../admin-menu-layout.js',import.meta.url),'utf8');
 const menu=await readFile(new URL('../admin-menu-registry.js',import.meta.url),'utf8');
 assert.doesNotMatch(layout,/section==='invest'.*import\('\.\/invest-admin\.js'/);
 assert.doesNotMatch(menu,/id: 'invest', group: 'services'/);
});
test('private My Invest remains owner-gated without a public service link',async()=>{
 const source=await readFile(new URL('../invest-my-workspace.js',import.meta.url),'utf8');
 assert.match(source,/export async function investMyRoute/);
 assert.match(source,/ownerAuthority/);
 assert.doesNotMatch(source,/href=\\?"\/invest\\?"/);
});
