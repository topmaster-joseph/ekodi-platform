// First-party EKODI-owned Chromium, read-only public Proposal Studio UI acceptance.
// The canonical background browser worker owns the browser/network isolation.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {runTask} from './ekodi-background-browser-worker.mjs';

const artifactRoot=path.resolve('artifacts/proposal-native-production');
const checked=[];
for(const profile of ['desktop','mobile-portrait']){
 const task={
  taskId:'proposal-native-'+profile,
  path:'/proposal/',
  deviceProfile:profile,
  allowMutation:false,
  timeoutMs:120000,
  actions:[
   {type:'waitFor',selector:'#titleInput',timeoutMs:15000},
   {type:'fill',selector:'#titleInput',value:'EKODI 제안서 운영 확인 — 임시 입력'},
   {type:'fill',selector:'#ideaInput',value:'브라우저 내부 작성 시안만 검증. 운영 데이터 저장 없음.'},
   {type:'click',selector:'#generateBtn'},
   // Export controls are intentionally hidden until an editor is generated.
   {type:'waitFor',selector:'#exportDocx',timeoutMs:15000},
   {type:'waitFor',selector:'#exportXlsx',timeoutMs:15000},
   {type:'waitFor',selector:'#exportPptx',timeoutMs:15000},
   {type:'assertText',text:'Word DOCX 저장'},
   {type:'assertText',text:'PowerPoint PPTX 저장'},
   {type:'assertText',text:'제안서 목차가 구성됐습니다.'},
   {type:'snapshot'},
   {type:'screenshot',name:'proposal-'+profile,fullPage:true}
  ]
 };
 const result=await runTask(task,{artifactRoot});
 const snap=result.results.find(row=>row.type==='snapshot');
 assert.equal(result.ok,true);
 assert.equal(result.mode,'ekodi-owned-background-browser');
 assert.equal(result.canonicalOrigin,'https://ekodi.kr');
 assert.match(result.finalUrl,/^https:\/\/ekodi\.kr\/proposal\/$/);
 assert.equal(result.allowMutation,false);
 assert.equal(result.activeUserProfileReused,false);
 assert.equal(result.hostInputInjection,false);
 assert.equal(result.blockedMutations.length,0);
 assert.equal(result.pageErrors.length,0,'Browser JavaScript errors must be zero');
 assert.equal(result.requestFailures.length,0,'Failed asset fetches must be zero');
 assert.equal(result.httpErrorResponses.length,0,'No HTTP 4xx/5xx on proposal surface');
 assert.equal(snap?.horizontalOverflow,false,'Mobile/desktop horizontal overflow');
 assert.match(snap?.title||'',/제안서 작업실/);
 assert.ok(result.screenshots.length>=1,'Native screenshot evidence missing');
 checked.push({profile,viewport:result.viewport,finalUrl:result.finalUrl,readOnly:true,uiEditorFunctional:true,screenshot:result.screenshots[0].file});
}
await fs.mkdir(artifactRoot,{recursive:true});
await fs.writeFile(path.join(artifactRoot,'proposal-production-ui.json'),JSON.stringify({ok:true,provider:'ekodi-background-browser-worker',url:'https://ekodi.kr/proposal/',profiles:checked},null,2));
console.log('EKODI_NATIVE_PROPOSAL_PRODUCTION='+JSON.stringify({ok:true,profiles:checked}));
