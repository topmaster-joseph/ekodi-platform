import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../my/workspace-selector-sync.js',import.meta.url),'utf8');
test('My workspace sync does not require a legacy select element',()=>{
  assert.match(source,/if\(!host\)return/);
  assert.doesNotMatch(source,/if\(!host\|\|!select\)return/);
});
test('selected My workspace is propagated through the canonical Shell context contract',()=>{
  assert.match(source,/classList\.contains\('selected'\)/);
  assert.match(source,/workspaceKey/);
  assert.match(source,/workspaceName/);
  assert.match(source,/personName/);
  assert.match(source,/EKODIShell\?\.setContext/);
  assert.match(source,/ekodi:context-change/);
});
test('My sync observes identity and workspace changes and remains optional for legacy selector UI',()=>{
  assert.match(source,/#identityName/);
  assert.match(source,/MutationObserver/);
  assert.match(source,/if\(select\)/);
  assert.match(source,/ekodiWorkspaceContext/);
});
