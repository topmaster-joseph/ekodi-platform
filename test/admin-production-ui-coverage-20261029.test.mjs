import test from 'node:test';
import assert from 'node:assert/strict';
import {auditAdminProductionUiCoverage} from '../scripts/admin-production-ui-coverage.mjs';

const menuIds=['sites-core','search-visibility','accounts'];
const success=id=>({id,ok:true});
const complete=[success('command-home'),...menuIds.map(success),
  success('search-visibility-interactions'),success('search-visibility-google-readonly')];

test('counts registered menu, Control and Search Visibility read-only proof once each',()=>{
  assert.deepEqual(auditAdminProductionUiCoverage(menuIds,complete),{
    ok:true,actualCount:6,expectedCount:6,issues:[]
  });
});
test('the original 52/51 drift cannot hide the new Google read-only proof',()=>{
  const menus=Array.from({length:49},(_,i)=>i===4?'search-visibility': 'menu-'+i);
  const results=[success('command-home'),...menus.map(success),
    success('search-visibility-interactions'),success('search-visibility-google-readonly')];
  const coverage=auditAdminProductionUiCoverage(menus,results);
  assert.equal(coverage.ok,true);
  assert.equal(coverage.expectedCount,52);
  assert.equal(coverage.actualCount,52);
});
test('missing Google read-only check cannot be mistaken for legacy complete coverage',()=>{
  const incomplete=complete.filter(x=>x.id!=='search-visibility-google-readonly');
  const result=auditAdminProductionUiCoverage(menuIds,incomplete);
  assert.equal(result.ok,false);
  assert.ok(result.issues.includes('missing: search-visibility-google-readonly'));
});
test('fails closed on a missing interaction, even when count matches via unexpected result',()=>{
  const shifted=[...complete.filter(x=>x.id!=='search-visibility-interactions'),success('placeholder')];
  const result=auditAdminProductionUiCoverage(menuIds,shifted);
  assert.equal(result.ok,false);
  assert.equal(result.actualCount,result.expectedCount);
  assert.ok(result.issues.includes('missing: search-visibility-interactions'));
  assert.ok(result.issues.includes('unexpected: placeholder (1)'));
});
test('fails on duplicate menu verification and unverified entry',()=>{
  const duplicate=auditAdminProductionUiCoverage(menuIds,[...complete,success('sites-core')]);
  assert.equal(duplicate.ok,false);
  assert.ok(duplicate.issues.some(x=>x.startsWith('duplicate: sites-core')));
  const failed=auditAdminProductionUiCoverage(menuIds,complete.map(x=>x.id==='sites-core'?{id:x.id,ok:false}:x));
  assert.equal(failed.ok,false);
  assert.ok(failed.issues.includes('unverified: sites-core'));
});
test('does not demand unrelated supplemental probe when Search Visibility not registered',()=>{
  const menus=['sites-core','accounts'];
  const r=auditAdminProductionUiCoverage(menus,[success('command-home'),...menus.map(success)]);
  assert.equal(r.ok,true);
  assert.equal(r.expectedCount,3);
});
test('rejects duplicated or invalid registry declarations',()=>{
  assert.equal(auditAdminProductionUiCoverage(['sites-core','sites-core'],[success('command-home'),success('sites-core')]).ok,false);
  assert.throws(()=>auditAdminProductionUiCoverage(null,[]),TypeError);
});
