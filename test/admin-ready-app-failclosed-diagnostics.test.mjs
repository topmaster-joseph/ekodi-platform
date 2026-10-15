import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('authenticated Admin E2E reports bounded app-shell evidence but never bypasses readiness',async()=>{
  const source=await readFile(new URL('../scripts/admin-authenticated-e2e-menu-worker.mjs',import.meta.url),'utf8');
  const start=source.indexOf("  stage('ready-app');");
  const end=source.indexOf("  stage('ready-runtime');",start);
  assert.ok(start>=0&&end>start,'capture evidence only at existing app readiness boundary');
  const section=source.slice(start,end);
  assert.match(section,/waitForSelector\('#app:not\(\[hidden\]\)'/);
  for(const field of ['pathname','documentReadyState','appPresent','appHidden','adminPanelsReady','adminSidebarReady','loginFormPresent']){
    assert.ok(section.includes(field),field);
  }
  assert.match(section,/catch \(error\)/);
  assert.match(section,/throw error;/,'a hidden app remains a failing protected E2E');
  assert.match(section,/pageErrors=\$\{pageErrors\.length\}/);
  assert.match(section,/failedAdminAssets=\$\{failedAdminAssets\.length\}/);
  for(const forbidden of ['sessionStorage.getItem','localStorage','document.cookie','authorization','Bearer ','innerHTML','outerHTML','location.search','response.text']){
    assert.ok(!section.includes(forbidden),'readiness log must not capture secrets or private HTML: '+forbidden);
  }
});
