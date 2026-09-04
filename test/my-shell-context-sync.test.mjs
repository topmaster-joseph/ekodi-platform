import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const app=await readFile(new URL('../my/app.js',import.meta.url),'utf8');
test('My workspace context remains internal without selector UI',()=>{assert.match(app,/ensureActiveWorkspace/);assert.match(app,/activeWorkspaceKey/);assert.match(app,/rememberWorkspace/);assert.doesNotMatch(app,/workspaceList|workspaceSwitcher|renderWorkspaceSelector/);});
