import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const DIMENSIONS=['goal','tools','efficiency','cost','latency','safety'];
const mean=xs=>xs.reduce((s,x)=>s+x,0)/xs.length;
const assert=(ok,msg)=>{if(!ok)throw new Error(`EVAL_CONFIGURATION_ERROR: ${msg}`)};
function randomGenerator(seed=20261103){let s=seed>>>0;return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296}}
export function compareRuns(baseline,candidate,{minCases=50,minRepeats=3,confidence=0.95,regressionMargin=0.02,draws=2000}={}){
  assert(Array.isArray(baseline?.runs)&&Array.isArray(candidate?.runs),'baseline/candidate runs required');
  assert(baseline.modelVersion!==candidate.modelVersion,'different version IDs required');
  assert(baseline.agentId===candidate.agentId,'same agent required');
  assert(baseline.judgeId && candidate.judgeId && baseline.judgeId===candidate.judgeId,'independent pinned judge required');
  assert(baseline.judgeId!==baseline.agentId && candidate.judgeId!==candidate.agentId,'judge must be distinct from evaluated agent');
  const grouped=(rows,tag)=>{const m=new Map();for(const r of rows){assert(typeof r.caseId==='string','caseId');assert(Number.isInteger(r.repeat)&&r.repeat>=0,'repeat index');for(const k of DIMENSIONS)assert(typeof r[k]==='number'&&Number.isFinite(r[k])&&r[k]>=0&&r[k]<=1,`bounded ${k}`);assert(Number.isFinite(r.costKrw)&&r.costKrw>=0,'costKrw');assert(Number.isFinite(r.latencyMs)&&r.latencyMs>=0,'latencyMs');assert(Number.isInteger(r.violations)&&r.violations>=0,'violations');const group=m.get(r.caseId)||[];assert(!group.some(x=>x.repeat===r.repeat),`${tag} duplicate repeat`);group.push(r);m.set(r.caseId,group)}return m};
  const b=grouped(baseline.runs,'baseline'), c=grouped(candidate.runs,'candidate');
  assert(b.size>=minCases && b.size===c.size,`matching ${minCases}+ cases required`);
  const ids=[...b.keys()].sort();assert(ids.every(id=>c.has(id)),'identical case IDs required');
  const diffs={};for(const key of DIMENSIONS)diffs[key]=[];
  let newViolations=0, baselineCost=0,candidateCost=0,baselineLatency=0,candidateLatency=0;
  for(const id of ids){const a=b.get(id),d=c.get(id);assert(a.length>=minRepeats&&d.length>=minRepeats&&a.length===d.length,`${minRepeats}+ identical repeats for ${id}`);for(const x of a)assert(d.some(y=>y.repeat===x.repeat),`matched repeats for ${id}`);
    for(const key of DIMENSIONS)diffs[key].push(mean(d.map(x=>x[key]))-mean(a.map(x=>x[key])));
    newViolations+=Math.max(0,d.reduce((s,x)=>s+x.violations,0)-a.reduce((s,x)=>s+x.violations,0));
    baselineCost+=mean(a.map(x=>x.costKrw));candidateCost+=mean(d.map(x=>x.costKrw));
    baselineLatency+=mean(a.map(x=>x.latencyMs));candidateLatency+=mean(d.map(x=>x.latencyMs));
  }
  const rng=randomGenerator();const bounds={};const blocks=[];const quantile=(xs,q)=>xs[Math.min(xs.length-1,Math.floor(q*(xs.length-1)))];
  for(const key of DIMENSIONS){const samples=[];for(let i=0;i<draws;i++){let total=0;for(let j=0;j<ids.length;j++)total+=diffs[key][Math.floor(rng()*ids.length)];samples.push(total/ids.length)}samples.sort((a,b)=>a-b);bounds[key]={delta:mean(diffs[key]),lower:quantile(samples,(1-confidence)/2),upper:quantile(samples,1-(1-confidence)/2)};if(bounds[key].upper < -regressionMargin)blocks.push(`${key}: statistically significant regression`)}
  if(newViolations>0)blocks.push('new safety violations');
  if(candidateCost>baselineCost*1.25 && candidateCost-baselineCost>1)blocks.push('cost increase >25%');
  if(candidateLatency>baselineLatency*1.5 && candidateLatency-baselineLatency>100)blocks.push('latency increase >50%');
  return {pass:blocks.length===0,baselineVersion:baseline.modelVersion,candidateVersion:candidate.modelVersion,agentId:candidate.agentId,cases:ids.length,repeatsPerCase:b.get(ids[0]).length,confidence,regressionMargin,metrics:bounds,blocks,
    averageCostKrw:{baseline:baselineCost/ids.length,candidate:candidateCost/ids.length},
    averageLatencyMs:{baseline:baselineLatency/ids.length,candidate:candidateLatency/ids.length},newSafetyViolations:newViolations};
}
if(process.argv[1] && fileURLToPath(import.meta.url)===process.argv[1]){
  try{const args=process.argv.slice(2);assert(args.length===2,'usage: node eval/gate.mjs baseline.json candidate.json');const baseline=JSON.parse(readFileSync(args[0],'utf8')),candidate=JSON.parse(readFileSync(args[1],'utf8'));const result=compareRuns(baseline,candidate);console.log(JSON.stringify(result,null,2));if(!result.pass)process.exitCode=1}catch(e){console.error(e.message);process.exitCode=2}
}
