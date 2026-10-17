import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import board from '../services/independent-board/worker.js';

const workflow=await readFile(new URL('../.github/workflows/deploy-independent-board.yml',import.meta.url),'utf8');
test('protected release verifies fresh citizen UI, old API retirement and notice/finance boundaries',()=>{
 for(const label of ['clean voices search control','clean voices write control','clean voices list','server-verification before writing','new isolated data API'])assert.ok(workflow.includes(label),label);
 assert.match(workflow,/old API not retired|legacy citizen API must return HTTP 410/);
 assert.match(workflow,/legacy citizen composer was unexpectedly served/);
 assert.match(workflow,/Verify production Google login-first API without credentials/);
 assert.match(workflow,/Remove old citizen records and referenced photos after cutover/);
 assert.doesNotMatch(workflow,/verify_contains "voices search control" 'id="voiceSearch"'/);
});

test('both domains render independent fresh composer without legacy UI and verify token before write',async()=>{
 for(const url of ['https://seonammedi.kr/board/voices','https://ekodi.kr/seonammedi/board/voices']){
  const response=await board.fetch(new Request(url),{});
  assert.equal(response.status,200);
  const html=await response.text();
  for(const id of ['freshSearch','freshWrite','freshForm','freshList','freshMessage'])assert.ok(html.includes('id="'+id+'"'),id);
  assert.match(html,/const t=await session\(\);if\(!t\)/);
  assert.match(html,/waitUntilPublished\(saved\)/);
  assert.match(html,/posts\.some\(p=>p\.id===savedId\)/);
  assert.match(html,/adminAllowed/);
  assert.doesNotMatch(html,/id="writeToggle"|id="searchToggle"|id="voiceSearch"/);
 }
});
