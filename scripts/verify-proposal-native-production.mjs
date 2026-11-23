// First-party EKODI-owned Chromium, read-only public Proposal Studio UI acceptance.
// The canonical background browser worker owns the browser/network isolation.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {runTask} from './ekodi-background-browser-worker.mjs';
// Shared, narrowly audited classification of browser security blocks. The
// Education lanes have used it since the strict CSP landed; it matches an exact
// method and URL, never a prefix or a wildcard, so anything unlisted still fails.
import {classifyRequestSecurityBlock,classifyMutationSecurityBlock} from './education-native-security-observations.mjs';

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
   // Editor export controls are hidden until createProposalDraft succeeds.
   {type:'snapshot'},
   {type:'screenshot',name:'proposal-'+profile,fullPage:true},
   {type:'waitFor',selector:'#exportDocx',timeoutMs:15000},
   {type:'waitFor',selector:'#exportXlsx',timeoutMs:15000},
   {type:'waitFor',selector:'#exportPptx',timeoutMs:15000},
   {type:'assertText',text:'Word DOCX 저장'},
   {type:'assertText',text:'PowerPoint PPTX 저장'}
  ]
 };
 const result=await runTask(task,{artifactRoot});
 const snap=result.results.find(row=>row.type==='snapshot');
 console.log('EKODI_PROPOSAL_NATIVE_DIAGNOSTICS='+JSON.stringify({profile,statusExcerpt:(snap?.bodyText||'').slice(-850),pageErrors:result.pageErrors,consoleErrors:result.consoleErrors,httpErrors:result.httpErrorResponses,requests:result.requestFailures,finalUrl:result.finalUrl}));
 assert.ok((snap?.bodyText||'').includes('제안서 목차가 구성됐습니다.'),'Expected generated editor status. Native diagnostics recorded above.');
 assert.equal(result.ok,true);
 assert.equal(result.mode,'ekodi-owned-background-browser');
 assert.equal(result.canonicalOrigin,'https://ekodi.kr');
 assert.match(result.finalUrl,/^https:\/\/ekodi\.kr\/proposal\/$/);
 assert.equal(result.allowMutation,false);
 assert.equal(result.activeUserProfileReused,false);
 assert.equal(result.hostInputInjection,false);
 // 2026-11-08 부터 에코디 전체 공개 사이트 푸터가 방문통계를 보낸다(1b578a2bf).
 // 읽기전용 탐침은 그 POST 를 의도적으로 끊으므로, 차단된 변경 수를 0 으로 못박으면
 // 운영이 정상인데도 레인이 깨진다. 그래서 "차단된 변경이 없다" 가 아니라 "차단된
 // 변경이 전부 그 하나로 분류된다" 를 고정한다. 분류되지 않는 변경은 그대로 실패다.
 const mutationBlockKinds=result.blockedMutations.map(item=>classifyMutationSecurityBlock(item.method,item.url));
 const unexpectedMutations=result.blockedMutations.filter((_,index)=>mutationBlockKinds[index]===null);
 assert.deepEqual(unexpectedMutations,[],'Unexpected mutating request on a read-only surface');
 assert.equal(result.pageErrors.length,0,'Browser JavaScript errors must be zero');
 // 제3자 Cloudflare Insights 비콘은 엄격한 1차 CSP 가 거부한다. 방문통계 요청은 위와
 // 같은 읽기전용 차단이다. 둘 다 보안상 올바른 거부이고, 그 밖의 실패 요청은 치명적으로 남는다.
 const requestBlockKinds=result.requestFailures.map(item=>classifyRequestSecurityBlock(item.url,item.failure));
 const unexpectedFailures=result.requestFailures.filter((_,index)=>requestBlockKinds[index]===null);
 assert.deepEqual(unexpectedFailures,[],'First-party or unexpected resource failure');
 const observedSecurityBlocks=[...new Set([...mutationBlockKinds,...requestBlockKinds].filter(Boolean))].sort();
 assert.equal(result.httpErrorResponses.length,0,'No HTTP 4xx/5xx on proposal surface');
 assert.equal(result.consoleErrors.filter(line=>line.includes('/proposal/client.js')||line.includes('/proposal/app.css')).length,0,'No blocked proposal application script/style');
 assert.equal(snap?.horizontalOverflow,false,'Mobile/desktop horizontal overflow');
 assert.match(snap?.title||'',/제안서 작업실/);
 assert.ok(result.screenshots.length>=1,'Native screenshot evidence missing');
 checked.push({profile,viewport:result.viewport,finalUrl:result.finalUrl,readOnly:true,uiEditorFunctional:true,observedSecurityBlocks,screenshot:result.screenshots[0].file});
}
await fs.mkdir(artifactRoot,{recursive:true});
await fs.writeFile(path.join(artifactRoot,'proposal-production-ui.json'),JSON.stringify({ok:true,provider:'ekodi-background-browser-worker',url:'https://ekodi.kr/proposal/',profiles:checked},null,2));
console.log('EKODI_NATIVE_PROPOSAL_PRODUCTION='+JSON.stringify({ok:true,profiles:checked}));
