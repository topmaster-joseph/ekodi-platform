import test from 'node:test';
import assert from 'node:assert/strict';
import {compareRuns} from '../gate.mjs';
import {scoreTrajectory} from '../score.mjs';
import {quarantineFromLog} from '../privacy.mjs';
const evidence=(version,fail=false)=>({agentId:'orchestrator',judgeId:'policy-judge-v1',modelVersion:version,runs:Array.from({length:50},(_,i)=>Array.from({length:3},(_,repeat)=>({caseId:`route-${String(i+1).padStart(3,'0')}`,repeat,goal:fail?0:1,tools:fail?0:1,efficiency:fail?.1:1,cost:1,latency:1,safety:1,costKrw:0,latencyMs:20,violations:0}))).flat()});
test('six dimensions score a traced routing decision separately',()=>{
  const result=scoreTrajectory({id:'route-1',allowedRoutes:['local'],expectedTools:['rankProviders'],maxSteps:2,maxCostKrw:0,maxLatencyMs:30},
    {caseId:'route-1',route:'local',completed:true,trajectory:[{type:'tool',name:'rankProviders'}],costKrw:0,latencyMs:20,safetyViolations:[]});
  for(const k of ['goal','tools','efficiency','cost','latency','safety'])assert.equal(result[k],1);
});
test('different tool and extra retry are measured even when outcome succeeds',()=>{
  const result=scoreTrajectory({id:'route-1',allowedRoutes:['local'],expectedTools:['rankProviders'],maxSteps:1,maxCostKrw:0,maxLatencyMs:30},
    {caseId:'route-1',route:'local',completed:true,trajectory:[{type:'tool',name:'wrong'},{type:'retry'}],costKrw:5,latencyMs:80,safetyViolations:['unsafe']});
  assert.equal(result.goal,1);assert.equal(result.tools,0);assert.equal(result.efficiency,0);assert.equal(result.cost,0);assert.equal(result.latency,0);assert.equal(result.safety,0);
});
test('CI accepts identical measured baseline/candidate',()=>{assert.equal(compareRuns(evidence('v11'),evidence('v12')).pass,true)});
test('intentional 50-case regression BLOCKS release',()=>{const r=compareRuns(evidence('v11'),evidence('v12',true));assert.equal(r.pass,false);assert(r.blocks.some(x=>x.includes('goal')));assert(r.metrics.goal.upper<0)});
test('new safety violations block even without statistically significant quality drop',()=>{const a=evidence('v11'),b=evidence('v12');b.runs[0].violations=1;b.runs[0].safety=0;assert(compareRuns(a,b).blocks.includes('new safety violations'))});
test('unpaired repeats or too few cases fail closed',()=>{const a=evidence('v11'),b=evidence('v12');b.runs.pop();assert.throws(()=>compareRuns(a,b),/repeats/);assert.throws(()=>compareRuns(a,{...a,modelVersion:'v12',runs:a.runs.slice(0,3)}),/cases/)});
test('evaluated model cannot judge itself',()=>{assert.throws(()=>compareRuns(evidence('v11'),{...evidence('v12'),judgeId:'orchestrator'}),/judge/)});
test('sensitive source never auto-promoted as a golden',()=>{const r=quarantineFromLog({id:42,prompt:'메일 joseph@example.kr / 연락처 010-1234-5678 비밀 sk-proj-ABCDEFGH0000'},'an-unshared-long-private-salt');assert(!r.task.includes('joseph@'));assert(!r.task.includes('010-1234'));assert(!r.task.includes('ABCDEFGH'));assert.equal(r.eligibleForGolden,false)});
