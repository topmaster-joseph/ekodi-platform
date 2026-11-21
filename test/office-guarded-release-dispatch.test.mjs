import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const convergence=read('scripts/converge-orchestrated-pr-merge.mjs');
const recovery=read('scripts/recover-release-provenance.mjs');
const deploy=read('.github/workflows/deploy-site-core.yml');
const build=read('scripts/build.mjs');
const office=read('office-prototype/index.html');

function siteScope(source,varname){
  const marker='const sharedSiteTouched='+varname+'.some(file=>';
  const start=source.indexOf(marker);
  assert.ok(start>=0,marker);
  const end=source.indexOf('\n);',start);
  assert.ok(end>start,'missing site scope close');
  return source.slice(start,end+3);
}

test('all three guarded Shared Site release entrypoints see exact Office UI source changes',()=>{
  const scopes=[
    siteScope(convergence,'changedFiles'),
    siteScope(recovery,'sourceFiles'),
  ];
  for(const s of scopes){
    assert.match(s,/file\.startsWith\('office-prototype\/'\)/);
    assert.doesNotMatch(s,/file\.startsWith\('office-desktop\/'\)/);
    assert.match(s,/file\.startsWith\('notifications\/'\)/,'existing shared asset rules preserved');
  }
  assert.match(deploy,/^\s+- 'office-prototype\/\*\*'$/m,'ordinary authenticated pushes retain canonical workflow path filter');
  assert.match(convergence,/if\(sharedSiteTouched\)\s*\{\s*const dispatch=await api\('\/actions\/workflows\/deploy-site-core\.yml\/dispatches'/);
  assert.match(recovery,/if\(sharedSiteTouched\)\s*\{\s*const siteDispatch=await github\(/);
});
test('official dispatch remains guarded and is not a direct production worker upload',()=>{
  for(const x of [convergence,recovery]){
    assert.match(x,/deploy-site-core\.yml/);
    assert.doesNotMatch(siteScope(x,x===convergence?'changedFiles':'sourceFiles'),/file\.startsWith\('office-desktop\/'\)/);
  }
  assert.match(deploy,/needs: \[staging_gate, reliability_gate\]/);
  assert.match(deploy,/uses: \.\/\.github\/workflows\/reliability-validation\.yml/);
  assert.match(deploy,/guarded-worker-release\.mjs/);
  assert.match(build,/office-prototype\/index\.html/);
  assert.match(build,/office-prototype\/office\.css/);
  assert.match(build,/office-prototype\/office\.js/);
  assert.match(office,/id="flows"/);
});
