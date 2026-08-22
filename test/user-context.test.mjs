import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../shell/user-context.js',import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('../ekodi-shell-worker.js',import.meta.url),'utf8');
test('user context is limited to user surfaces',()=>{assert.match(source,/public/);assert.match(source,/workspace/);assert.match(source,/ekodiShellSurface/);});
test('workspace switcher returns through My EKODI',()=>{assert.match(source,/my\.ekodi\.kr/);assert.match(source,/workspaces/);assert.match(source,/return_to/);});
test('context supports identity workspace role and mobile UI',()=>{assert.match(source,/ekodiUserName/);assert.match(source,/ekodiWorkspaceName/);assert.match(source,/ekodiUserRole/);assert.match(source,/@media\(max-width:768px\)/);});
test('shell bundles user context',()=>{assert.match(worker,/user-context\.js/);assert.match(worker,/userContext/);});
