import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
test('My EKODI exposes no workspace selector chrome',async()=>{const html=await read('my/index.html');assert.doesNotMatch(html,/workspaceList|workspaceSwitcher|workspace-selector-sync|workspace-selector-shell/);});
test('My EKODI keeps deterministic workspace context internally',async()=>{const app=await read('my/app.js');for(const marker of ['ensureActiveWorkspace','activeWorkspaceKey','rememberWorkspace','serviceRoute'])assert.match(app,new RegExp(marker));assert.doesNotMatch(app,/function workspaceUi\(|function enterWorkspace\(/);});
