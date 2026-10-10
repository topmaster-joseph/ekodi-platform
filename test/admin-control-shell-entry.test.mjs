import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const js=readFileSync(new URL('../admin-sidebar.js',import.meta.url),'utf8');
test('the real admin shell has one canonical EKODI Control navigation entry',()=>{
 assert.match(js,/globals\.querySelector\('\[data-ekodi-control-entry\]'\)/);
 assert.match(js,/control\.href = '\/admin\/control'/);
 assert.match(js,/control\.dataset\.ekodiControlEntry = 'true'/);
 assert.match(js,/globals\.append\(control\)/);
 assert.match(js,/에코디 운영관제 열기/);
});