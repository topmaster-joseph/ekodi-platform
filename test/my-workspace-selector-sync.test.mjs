import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('My EKODI loads the shared workspace selector sync layer',async()=>{
  const html=await read('my/index.html');
  assert.match(html,/workspace-selector-shell\.css/);
  assert.match(html,/workspace-selector-sync\.js/);
});

test('workspace selector uses one deterministic order for cards and dropdown',async()=>{
  const source=await read('my/workspace-selector-sync.js');
  assert.match(source,/personal:10,business:20,organization:30,church:40,community:50,project:60/);
  assert.match(source,/classList\.contains\('selected'\)/);
  assert.match(source,/workspaceList/);
  assert.match(source,/workspaceSwitcher/);
  assert.match(source,/ekodiWorkspaceOrder/);
});

test('workspace selector visual state consumes EKODI Shell tokens without changing layout',async()=>{
  const css=await read('my/workspace-selector-shell.css');
  for(const token of ['--ekodi-shell-accent','--ekodi-shell-border','--ekodi-shell-surface','--ekodi-shell-text','--ekodi-shell-muted'])assert.match(css,new RegExp(token));
  assert.match(css,/focus-visible/);
  assert.doesNotMatch(css,/position:\s*fixed/);
});
