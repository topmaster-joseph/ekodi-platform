import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const worker=read('scripts/verify-admin-production-ui-e2e.mjs');
const searchProof=read('scripts/verify-search-visibility-interactions.mjs');

function expectedInventory(menuIds, results) {
  const extra=['command-home'];
  if(menuIds.includes('search-visibility'))extra.push('search-visibility-interactions');
  const required=new Set([...menuIds,...extra]);
  const observed=results.map(x=>x.id);
  return {
    expected:required.size,
    active:results.filter(x=>x.ok).length,
    duplicated:observed.filter((id,index)=>observed.indexOf(id)!==index),
    missing:[...required].filter(id=>!observed.includes(id)),
    unexpected:observed.filter(id=>!required.has(id))
  };
}

test('production Admin checks the separately executed Search Visibility interactive proof',()=>{
  assert.match(worker,/supplementalVerifications = \['command-home'\]/);
  assert.match(worker,/menuIds\.includes\('search-visibility'\)/);
  assert.match(worker,/supplementalVerifications\.push\('search-visibility-interactions'\)/);
  assert.match(worker,/requiredVerificationIds = new Set\(\[\.\.\.menuIds, \.\.\.supplementalVerifications\]\)/);
  assert.match(worker,/duplicates\.length\|\|missing\.length\|\|unexpected\.length/);
  assert.match(searchProof,/results\.push\(\{id:'search-visibility-interactions'/);
  assert.doesNotMatch(worker,/const expectedCount = menus\.length \+ 1;/);
});

test('proof count includes valid read-only supplement, without masking missing menu',()=>{
  const menus=['platform-overview','search-visibility','social-accounts'];
  const results=['command-home','platform-overview','search-visibility-interactions','search-visibility','social-accounts']
    .map(id=>({id,ok:true}));
  assert.deepEqual(expectedInventory(menus,results),{
    expected:5,active:5,duplicated:[],missing:[],unexpected:[]
  });
  const incomplete=expectedInventory(menus,results.filter(x=>x.id!=='social-accounts'));
  assert.deepEqual(incomplete.missing,['social-accounts']);
  const duplicate=expectedInventory(menus,[...results,results[1]]);
  assert.deepEqual(duplicate.duplicated,['platform-overview']);
  const unexpected=expectedInventory(menus,[...results,{id:'invented-pass',ok:true}]);
  assert.deepEqual(unexpected.unexpected,['invented-pass']);
});
