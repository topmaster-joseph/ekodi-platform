import test from 'node:test';
import assert from 'node:assert/strict';
import {rankProviders, scoreProvider} from '../../ai-router-score.js';

// Synthetic policy probes against the REAL deployed router code. These 50 scenarios
// are NOT the privacy-reviewed production golden set or independently graded AI outputs.
const weights={taskFit:0,reliability:0,cost:1,latency:0,health:0,load:0,quality:0};
const tasks=Array.from({length:50},(_,i)=>({
 title:['관리자 메뉴 오류 검토','선교회 모임 홍보','상품 소싱 점검','한국어 논문 자료 분석','교육 PPT 기획'][i%5],
 prompt:`한국어 업무 경로 배정 비용정책 검증 ${i+1}`,
 needsCodeBranch:i%5===0
}));

test('EKODI real router keeps local-first cost priority for fifty Korean policy probes',()=>{
 for(let repeat=0;repeat<3;repeat++){
   for(const [index,task] of tasks.entries()){
     const candidates=['anthropic-api','openai-api','node:ollama-local'];
     const ranked=rankProviders(candidates,task,{routerPolicy:{weights}});
     assert.equal(ranked[0].providerId,'node:ollama-local',`scenario=${index},repeat=${repeat}`);
     assert.equal(ranked.length,3);
     assert(ranked[0].score>ranked[1].score,`local must strictly beat paid on cost: ${index}`);
   }
 }
});
test('real router explicit paid-opt-in cost is lower than local, free-priority floor',()=>{
 const task=tasks[0];
 const local=scoreProvider('node:ollama-local',task,{routerPolicy:{weights}});
 const paid=scoreProvider('anthropic-api',task,{routerPolicy:{weights}});
 assert(local.breakdown.cost>paid.breakdown.cost,'Paid models cannot be cost-equal to free-first local');
 assert.equal(local.breakdown.cost,1);
 assert(paid.breakdown.cost<1);
});
