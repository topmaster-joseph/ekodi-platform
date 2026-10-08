import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read = p => readFile(new URL('../'+p,import.meta.url),'utf8');
test('Mall channel automation uses the supported tenant subject type',async()=>{
 const ui=await read('workspace-admin-page.js');
 const growth=await read('marketing-growth-worker.js');
 assert.match(ui,/function automationQuery\(\)\{return '\?subject_type=tenant&subject_key='/);
 assert.doesNotMatch(ui,/function automationQuery\(\)\{return '\?subject_type=workspace&subject_key'/);
 assert.match(growth,/const SUBJECT_TYPES = new Set\(\['person','tenant','store'\]\)/);
});
