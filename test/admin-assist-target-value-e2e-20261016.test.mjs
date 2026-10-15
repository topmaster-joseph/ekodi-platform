import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const e2e=readFileSync(new URL('../scripts/admin-assist-canonical-e2e.mjs',import.meta.url),'utf8');
const dock=readFileSync(new URL('../admin-assist-dock.js',import.meta.url),'utf8');
const bootstrap=readFileSync(new URL('../admin-assist-bootstrap.js',import.meta.url),'utf8');

test('canonical Assist execution target compares machine value and visible label independently',()=>{
  assert.match(dock, /<option value=\\?"ekodi\\?">EKODI<\\/option>/);
  assert.match(e2e,/targetValue: target \? String\(target\.value/);
  assert.match(e2e,/targetLabel: target \? String\(target\.selectedOptions\?\.\[0\]\?\.textContent/);
  assert.match(e2e,/visual\?\.targetValue !== 'ekodi'/);
  assert.match(e2e,/visual\?\.targetLabel !== 'EKODI'/);
  assert.doesNotMatch(e2e,/visual\?\.targetValue !== 'EKODI'/);
  assert.match(e2e,/Number\(visual\?\.targetWidth \|\| 0\) < 150/);
});

test('canonical EKODI select value continues to route to its internal Assist submit',()=>{
  assert.match(bootstrap,/target==='ekodi'\?bridge\.submit\(text\):bridge\.handoff\(target,text\)/);
  assert.match(e2e,/await input\.fill\(prompt\)/);
  assert.match(e2e,/visualContractVerified = true/);
});
