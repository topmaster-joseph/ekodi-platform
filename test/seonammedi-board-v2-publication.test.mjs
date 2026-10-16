import test from 'node:test';
import assert from 'node:assert/strict';
import {createVoiceController} from '../services/independent-board/v2/citizen-controller.mjs';
const href='https://ekodi.kr/seonammedi/board/voices?compose=1';
const queued={queued:true,submissionId:'b9d1d830-3983-453c-b4db-a9b24391828a',statusUrl:'/board/api/submissions/b9d1d830-3983-453c-b4db-a9b24391828a'};
test('V2 reports published only after independent board queue confirms persistence',async()=>{
  let count=0;
  const controller=await createVoiceController({href,storage:{getItem:()=>null},fetcher:async url=>{
    assert.equal(url,'/seonammedi/board/api/submissions/b9d1d830-3983-453c-b4db-a9b24391828a');
    count++;return {ok:true,json:async()=>count===1?{status:'queued'}:{status:'published',id:19}};
  }});
  assert.deepEqual(await controller.publication(queued,{attempts:3,intervalMs:0,sleep:async()=>{}}),{published:true,id:19});
  assert.equal(count,2);
});
test('V2 does not claim publication before queue persistence is confirmed',async()=>{
  const controller=await createVoiceController({href,storage:{getItem:()=>null},fetcher:async()=>({ok:true,json:async()=>({status:'queued'})})});
  assert.deepEqual(await controller.publication(queued,{attempts:1,intervalMs:0,sleep:async()=>{}}),{published:false,pending:true});
  await assert.rejects(controller.publication({...queued,statusUrl:'https://evil.test'},{}),/invalid_submission_url/);
});
test('V2 static preview is isolated and does not overwrite existing production routes',async()=>{
  const {readFile}=await import('node:fs/promises');
  const worker=await readFile(new URL('../services/independent-board/worker.js',import.meta.url),'utf8');
  const html=await readFile(new URL('../services/independent-board/v2/index.html',import.meta.url),'utf8');
  assert.match(html,/citizen-app\.mjs/);
  assert.doesNotMatch(worker,/citizen-app\.mjs|citizen-controller\.mjs/);
});
