import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [workspace,store]=await Promise.all([
  readFile(new URL('../workspace-admin-page.js',import.meta.url),'utf8'),
  readFile(new URL('../store-admin-engine.js',import.meta.url),'utf8'),
]);

for(const [name,source,start,end] of [
  ['workspace',workspace,'  async function membersAdmin(){','  async function financeAdmin()'],
  ['store',store,'  async function memberAccessPanel(){','  function render(){'],
]){
  test(name+' access management presents actionable filters instead of a repeated top summary',()=>{
    const block=source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
    assert.ok(block.length>1000);
    assert.match(block,/\$\('summaryCards'\)\.hidden=true/);
    assert.doesNotMatch(block,/\$\('summaryCards'\)\.innerHTML=/);
    for(const filter of ["'all','전체 사용자'","'admin','관리자'","'active','활성'","'pre_registered','인증 대기'"]){
      assert.ok(block.includes(filter),filter);
    }
    assert.match(block,/data-member-filter=/);
    assert.match(block,/data-member-status=/);
    assert.match(block,/data-member-admin=/);
    assert.match(block,/aria-pressed/);
    assert.match(block,/button\.addEventListener\('click'/);
    assert.match(block,/row\.hidden=!match/);
    assert.match(block,/memberFilterEmpty/);
    assert.match(block,/access\/revoke/);
    assert.match(block,/ACCESS_REQUIRED|AUTH_REQUIRED|로그인|권한/);
  });
  test(name+' CSS keeps the hidden summary and filtered rows out of layout',()=>{
    assert.match(source,/#summaryCards\[hidden\],#mainPanel tr\[hidden\]/);
    assert.match(source,/\.access-filter-tab\[aria-pressed="true"\]/);
    assert.match(source,/\.access-filter-tab:focus-visible/);
  });
}

test('non-access workspace summary panels remain available for operational KPIs',()=>{
  assert.match(workspace,/function statusAdmin\(\)\{[^\n]*\$\('summaryCards'\)\.innerHTML=/);
  assert.match(workspace,/function recordsAdmin\(\)\{\$\('summaryCards'\)\.innerHTML=/);
});
