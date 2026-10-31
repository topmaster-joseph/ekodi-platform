import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateEducationSnapshot,validOfficialEducationCandidate,verifyEducationReleaseSnapshot}
 from '../scripts/verify-education-release-snapshot.mjs';

const s=x=>x.repeat(40);
const official='ai/chatgpt/orch_recovery_c00ab2855c048cdd6c1979daeb657f3f';
const pr={number:6946,state:'closed',merged_at:'2026-10-30T00:00:00Z',base:{ref:'main'},
 head:{ref:official,sha:s('a')},merge_commit_sha:s('b')};
test('accept only exact or demonstrably unrelated protected-main advancements',()=>{
 assert.deepEqual(validateEducationSnapshot({mergeSha:s('a'),releaseSha:s('a')}),
  {ok:true,reason:'exact_merge',releaseSha:s('a')});
 assert.equal(validateEducationSnapshot({mergeSha:s('b'),releaseSha:s('c')}).reason,'not_a_verified_main_ancestor');
 assert.equal(validateEducationSnapshot({mergeSha:s('b'),releaseSha:s('c'),comparison:{status:'diverged',ahead_by:1,files:[]}}).ok,false);
 assert.equal(validateEducationSnapshot({mergeSha:s('b'),releaseSha:s('c'),comparison:{status:'ahead',ahead_by:2,files:[{filename:'sites/mall/app.js'}]}}).ok,true);
 assert.equal(validateEducationSnapshot({mergeSha:s('b'),releaseSha:s('c'),comparison:{status:'ahead',ahead_by:2,files:[{filename:'education/study/farm-marketing/app.js'}]}}).reason,'newer_education_change_requires_own_orchestrator_authority');
 assert.equal(validateEducationSnapshot({mergeSha:s('b'),releaseSha:s('c'),comparison:{status:'ahead',ahead_by:3,files:[{filename:'education-worker.js'}]}}).ok,false);
 assert.equal(validateEducationSnapshot({mergeSha:s('b'),releaseSha:s('c'),comparison:{status:'ahead',ahead_by:3,files:Array.from({length:300},(_,i)=>({filename:'sites/mall/f'+i}))}}).reason,'compare_file_list_incomplete');
});
test('reject unmerged, changed-source, wrong service and unsupported branch',()=>{
 assert.equal(validOfficialEducationCandidate(pr,['education/study/farm-marketing/index.html']),true);
 assert.equal(validOfficialEducationCandidate({...pr,merged_at:null},['education/a']),false);
 assert.equal(validOfficialEducationCandidate({...pr,head:{...pr.head,ref:'ai/chatgpt/unsafe'}},['education/a']),false);
 assert.equal(validOfficialEducationCandidate(pr,['sites/mall/app.js']),false);
});
test('mocked canonical receipt, exact merge and source check bind production release snapshot',async()=>{
 const endpoints=[];
 const responses=[
  [ '/pulls?state=closed', [pr] ],
  [ '/pulls/6946/files', [{filename:'education/study/farm-marketing/index.html'}] ],
  [ '/commits/'+s('b')+'/pulls', [{number:6946,merged_at:'2026-10-30T00:00:00Z'}] ],
  [ '/compare/'+s('b')+'...'+s('c'), {status:'ahead',ahead_by:2,files:[{filename:'sites/mall/app.js'}]} ],
  [ '/commits/'+s('a')+'/status', {statuses:[{context:'test',state:'success'},{context:'EKODI AI Orchestration Gate',state:'success'}]} ]
 ];
 const mock=async url=>{endpoints.push(url);const entry=responses.find(([path])=>url.includes(path));if(!entry)throw Error('unexpected API '+url);return {ok:true,json:async()=>entry[1]}};
 let receipt=0;
 const result=await verifyEducationReleaseSnapshot({repo:'topmaster-joseph/ekodi-platform',token:'synthetic',
   branch:official,taskId:official.split('/').at(-1),releaseSha:s('c'),
   fetchImpl:mock,receiptVerifier:async()=>{receipt++}});
 assert.equal(result.ok,true);assert.equal(result.pr,6946);assert.equal(receipt,1);
 assert.equal(endpoints.length,5);
});
test('existing production workflow uses snapshot gate; no bypass or direct release command',()=>{
 const code=readFileSync(new URL('../scripts/verify-education-release-snapshot.mjs',import.meta.url),'utf8');
 assert.match(code,/verifyOrchestratorReleaseReceipt/);
 assert.match(code,/newer_education_change_requires_own_orchestrator_authority/);
 assert.doesNotMatch(code,/wrangler\s+(deploy|publish)|update_ref|force:\s*true/);
});
