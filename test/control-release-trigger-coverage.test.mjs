import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('standalone Control shell boundary changes always trigger Site Core',async()=>{
  const [workflow,recovery,wrapper,injector]=await Promise.all([
    read('.github/workflows/deploy-site-core.yml'),
    read('scripts/recover-release-provenance.mjs'),
    read('site-shell-worker.js'),
    read('ekodi-shell-injector.js')
  ]);
  const pushPaths=workflow.slice(workflow.indexOf('  push:'),workflow.indexOf('permissions:'));
  const touched=recovery.slice(recovery.indexOf('const sharedSiteTouched='),recovery.indexOf('const shellRuntimeTouched='));
  for(const changed of ['site-shell-worker.js','ekodi-shell-injector.js']){
    assert.ok(pushPaths.includes("'"+changed+"'"),'main push trigger omitted '+changed);
    assert.ok(touched.includes("'"+changed+"'"),'source merge dispatcher omitted '+changed);
  }
  assert.match(wrapper,/isShellIsolatedControlPath/);
  assert.match(injector,/if\(route==='control-surface'\|\|canonical==='control'\)return response/);
  assert.match(recovery,/\/actions\/workflows\/deploy-site-core\.yml\/dispatches/);
  assert.match(workflow,/scripts\/guarded-worker-release\.mjs/);
});
