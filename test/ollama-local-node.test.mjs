import test from 'node:test';
import assert from 'node:assert/strict';
import {availableProviderIds} from '../ai-control-core.js';
import {providerCostClass} from '../ai-router-score.js';
import {createNode, resourceDecision, validateJob} from '../tools/ekodi-ollama-node/node.mjs';

const validJob={id:'00000000-0000-4000-8000-000000000123', providerId:'node:ollama-local',needsCodeBranch:false,branch:'',prompt:'Briefly summarize a public changelog.'};
const creds={nodeId:'ollama-user3-a1b2c3d4',token:'x'.repeat(35)};

test('Ollama provider is free, explicitly selected and never a release branch executor',()=>{
  const capabilities={nodeProviders:['ollama-local']};
  assert.equal(providerCostClass('node:ollama-local'),'free-preferred');
  assert.deepEqual(availableProviderIds(capabilities,{requestedProviders:[],needsCodeBranch:false}),[]);
  assert.deepEqual(availableProviderIds(capabilities,{requestedProviders:['node:ollama-local'],needsCodeBranch:false}),['node:ollama-local']);
  assert.deepEqual(availableProviderIds(capabilities,{requestedProviders:['node:ollama-local'],needsCodeBranch:true}),[]);
});
test('Ollama node fails closed when memory, CPU, chassis or explicit enablement is missing',()=>{
  assert.equal(resourceDecision({memUsedPct:90,cpuLoadPct:15,desktopConfirmed:true,enabled:true}).autoExecutionEligible,false);
  assert.equal(resourceDecision({memUsedPct:40,cpuLoadPct:95,desktopConfirmed:true,enabled:true}).autoExecutionEligible,false);
  assert.equal(resourceDecision({memUsedPct:40,cpuLoadPct:10,desktopConfirmed:false,enabled:true}).autoExecutionEligible,false);
  assert.equal(resourceDecision({memUsedPct:40,cpuLoadPct:10,desktopConfirmed:true,enabled:false}).autoExecutionEligible,false);
  assert.equal(resourceDecision({memUsedPct:40,cpuLoadPct:10,desktopConfirmed:true,enabled:true}).autoExecutionEligible,true);
});
test('Ollama node rejects code deployment jobs and oversize prompts',()=>{
  assert.equal(validateJob(validJob).id,validJob.id);
  assert.throws(()=>validateJob({...validJob,needsCodeBranch:true}),/unsupported_job/);
  assert.throws(()=>validateJob({...validJob,branch:'main'}),/source_mutation/);
  assert.throws(()=>validateJob({...validJob,prompt:'p'.repeat(2501)}),/unsupported_prompt_length/);
});
test('Ollama node reports a local-only result to a valid queue lease',async()=>{
  const records=[];
  const fakeFetch=async (url,opts)=> {
    records.push({url,opts});
    return new Response(JSON.stringify(url.endsWith('/lease')?{job:validJob}:
      url.endsWith('/complete')?{ok:true}:{error:'unexpected'}),{status:200,headers:{'content-type':'application/json'}});
  };
  const node=createNode({...creds,desktopConfirmed:true,enabled:true,fetchImpl:fakeFetch,
    loadFn:async()=>({memUsedPct:22,cpuLoadPct:10}), modelFn:async()=>true,
    answerFn:async p=>'LOCAL-ANSWER: '+p});
  const result=await node.once();
  assert.equal(result.state,'reported');
  assert.equal(result.ok,true);
  assert.equal(records.length,2);
  assert.equal(records[0].url,'https://ekodi.kr/ai/api/node/lease');
  assert.equal(records[1].url,'https://ekodi.kr/ai/api/node/jobs/'+validJob.id+'/complete');
  assert.equal(JSON.parse(records[1].opts.body).output,'LOCAL-ANSWER: '+validJob.prompt);
  assert.equal(records[0].opts.headers.authorization,'Bearer '+creds.token);
});
test('Ollama worker rejects unsafe lease and reports failure without invoking model',async()=>{
  const unsafe={...validJob,needsCodeBranch:true,branch:'main'};
  const records=[];
  const fakeFetch=async(url,opts)=>{
    records.push({url,opts});
    return new Response(JSON.stringify(url.endsWith('/lease')?{job:unsafe}:{ok:true}),{status:200});
  };
  const node=createNode({...creds,desktopConfirmed:true,enabled:true,fetchImpl:fakeFetch,
    loadFn:async()=>({memUsedPct:10,cpuLoadPct:8}),modelFn:async()=>true,
    answerFn:async()=>{throw Error('model_must_not_be_invoked')}});
  const result=await node.once();
  assert.equal(result.ok,false);
  assert.equal(JSON.parse(records[1].opts.body).error,'unsupported_job');
});
test('Ineligible node still reports heartbeat but receives no work',async()=>{
  const records=[];
  const fakeFetch=async(url,opts)=>{records.push({url,opts});return new Response(JSON.stringify({job:null,scheduler:{reason:'hardware_eligibility_unknown'}}),{status:200});};
  const node=createNode({...creds,desktopConfirmed:true,enabled:true,fetchImpl:fakeFetch,
    loadFn:async()=>({memUsedPct:91,cpuLoadPct:9}),modelFn:async()=>true});
  const result=await node.once();
  assert.equal(result.state,'idle');
  assert.equal(result.eligible,false);
  assert.equal(JSON.parse(records[0].opts.body).system.autoExecutionEligible,false);
});
