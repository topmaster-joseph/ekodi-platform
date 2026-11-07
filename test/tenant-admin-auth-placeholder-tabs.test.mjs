import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { churchPastorAdminScript } from '../church-pastor-admin-page.js';
import { storeAdminScript } from '../store-admin-engine.js';

const [church,store]=await Promise.all([
  readFile(new URL('../church-pastor-admin-page.js',import.meta.url),'utf8'),
  readFile(new URL('../store-admin-engine.js',import.meta.url),'utf8'),
]);
const span=(source,a,b)=>{
  const from=source.indexOf(a),to=source.indexOf(b,from+a.length);
  assert.ok(from>=0&&to>from, a);
  return source.slice(from,to);
};

test('unauthenticated church and store screens do not create passive summary metrics',()=>{
  for(const [src,a,b] of [
    [church,'function loginPanel(','function permissionPanel('],
    [church,'function deniedPanel(','async function loadStaff('],
    [store,'function loginPanel(','function connectorStatus('],
    [store,'function permissionPanel(','function storedSession('],
  ]){
    const body=span(src,a,b);
    assert.match(body,/\$\('summaryCards'\)\.replaceChildren\(\)/);
    assert.doesNotMatch(body,/\$\('summaryCards'\)\.innerHTML/);
    assert.match(body,/\$\('mainPanel'\)\.innerHTML/);
  }
});

test('authorized metric card generation remains and scripts remain compilable',async()=>{
  assert.match(church,/async function overview\(\)/);
  assert.match(store,/function card\(/);
  for(const [name,produce] of [['church',churchPastorAdminScript],['store',storeAdminScript]]){
    const code=await (await produce()).text();
    assert.doesNotThrow(()=>new vm.Script(code,{filename:name+'.js'}));
    if(name!=='church')assert.match(code,/mountTenantAdminMetricsTabs/);
  }
});
