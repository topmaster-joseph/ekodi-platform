// FREE-AI-POOL-CAPACITY-20261019 regression suite.
// Production evidence (2026-10-17..18, ai_provider_calls): groq translation 141 empty responses vs 3 successes,
// OpenRouter free quota 45/45 exhausted daily with ~40% spent on scheduled health, Workers AI 20/20 calls
// exhausted at 01:00 UTC while the account Neuron allocation was mostly unused.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLOUDFLARE_WORKERS_AI_DEFAULTS,
  createCloudflareWorkersAiProvider,
  estimateWorkersAiNeurons,
  workersAiNeuronRate,
} from '../cloudflare-workers-ai-provider-adapter.js';
import { createGroqFreeProvider, groqReasoningControls, probeGroqFreeCredential } from '../groq-free-provider-adapter.js';
import { createOpenRouterFreeProvider, probeOpenRouterFreeCredential } from '../openrouter-free-provider-adapter.js';
import { invokeAiProviderCapability, runAiProviderHealthSchedule, shouldUseCredentialProbe } from '../ai-provider-control.js';

const json=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json',...headers}});
const today=()=>new Date().toISOString().slice(0,10);

function ledgerDb(seed={}){
  const rows=new Map(Object.entries(seed));
  const key=(id,day)=>`${id}|${day}`;
  return {
    rows,
    prepare(sql){
      return {
        bind(...args){
          return {
            async run(){
              if(sql.startsWith('INSERT OR IGNORE')){const k=key(args[0],args[1]);if(!rows.has(k))rows.set(k,0);return{meta:{changes:1}}}
              if(sql.includes('call_count=call_count+1')){const [,id,day,limit]=args;const k=key(id,day);if((rows.get(k)||0)>=limit)return{meta:{changes:0}};rows.set(k,(rows.get(k)||0)+1);return{meta:{changes:1}}}
              if(sql.includes('call_count=call_count+?')){const [amount,,id,day,,budget]=args;const k=key(id,day);if((rows.get(k)||0)+amount>budget)return{meta:{changes:0}};rows.set(k,(rows.get(k)||0)+amount);return{meta:{changes:1}}}
              if(sql.includes('MAX(0,call_count+?)')){const [delta,,id,day]=args;const k=key(id,day);rows.set(k,Math.max(0,(rows.get(k)||0)+delta));return{meta:{changes:1}}}
              if(sql.includes('call_count=CASE WHEN call_count>0')){const [,id,day]=args;const k=key(id,day);rows.set(k,Math.max(0,(rows.get(k)||0)-1));return{meta:{changes:1}}}
              return{meta:{changes:0}};
            },
            async first(){const [id,day]=args;return{call_count:rows.get(key(id,day))||0}}
          };
        }
      };
    }
  };
}

test('Workers AI Neuron estimate uses documented rates and over-reserves unknown models', () => {
  assert.deepEqual(workersAiNeuronRate('@cf/meta/llama-3.2-1b-instruct'),{input:2457,output:18252});
  assert.deepEqual(workersAiNeuronRate('@cf/unknown/model'),{input:25608,output:75147});
  // 1M output tokens on llama-3.2-1b = 18,252 Neurons; 10,000 free Neurons => ~548k output tokens/day.
  assert.equal(estimateWorkersAiNeurons('@cf/meta/llama-3.2-1b-instruct',0,1_000_000),18252);
  assert.equal(estimateWorkersAiNeurons('@cf/meta/llama-3.2-1b-instruct',0,0),1);
  assert.ok(CLOUDFLARE_WORKERS_AI_DEFAULTS.dailyNeuronBudget<10000,'budget must stay under the 10,000 Neuron free allocation');
});

test('Workers AI allows far more than 20 calls a day inside the Neuron budget and settles to actual usage', async () => {
  const db=ledgerDb();
  const env={ENVIRONMENT:'production',DB:db,EKODI_WORKERS_AI_DAILY_CALL_LIMIT:'300',AI:{async run(){return{response:'번역 완료',usage:{prompt_tokens:400,completion_tokens:120}}}}};
  const provider=createCloudflareWorkersAiProvider(env);
  for(let i=0;i<40;i++)await provider.invoke({taskName:'translate',context:{text:'안녕하세요'.repeat(20)}});
  assert.equal(db.rows.get(`cloudflare-workers-ai|${today()}`),40);
  const neurons=db.rows.get(`${CLOUDFLARE_WORKERS_AI_DEFAULTS.neuronLedgerId}|${today()}`);
  assert.equal(neurons,40*estimateWorkersAiNeurons(CLOUDFLARE_WORKERS_AI_DEFAULTS.model,400,120),'ledger settles to actual usage, not the reservation');
});

test('Workers AI blocks before running the model once the Neuron budget would be exceeded', async () => {
  const db=ledgerDb({[`cloudflare-workers-ai:neurons|${today()}`]:7990});
  let ran=0;
  const provider=createCloudflareWorkersAiProvider({ENVIRONMENT:'production',DB:db,AI:{async run(){ran+=1;return{response:'x'}}}});
  await assert.rejects(()=>provider.invoke({taskName:'t',context:{text:'x'.repeat(2000)}}),error=>error.message==='WORKERS_AI_DAILY_NEURON_BUDGET'&&error.status===429);
  assert.equal(ran,0);
  assert.equal(db.rows.get(`cloudflare-workers-ai|${today()}`),0,'blocked call is refunded from the call guard');
});

test('Workers AI honors requested output tokens within a bounded ceiling', async () => {
  const seen=[];
  const provider=createCloudflareWorkersAiProvider({ENVIRONMENT:'test',AI:{async run(model,payload){seen.push(payload.max_tokens);return{response:'ok'}}}});
  await provider.invoke({taskName:'a',maxOutputTokens:8192});
  await provider.invoke({taskName:'b'});
  assert.deepEqual(seen,[1024,CLOUDFLARE_WORKERS_AI_DEFAULTS.maxOutputTokens]);
});

test('Groq gpt-oss requests low hidden reasoning and the caller output budget', async () => {
  assert.deepEqual(groqReasoningControls('openai/gpt-oss-20b'),{reasoning_effort:'low',include_reasoning:false});
  assert.deepEqual(groqReasoningControls('llama-3.3-70b-versatile'),{});
  let body=null;
  const provider=createGroqFreeProvider({ENVIRONMENT:'test',GROQ_API_KEY:'gsk_test',EKODI_PROVIDER_GROQ_FREE_ENABLED:'true'},{fetchImpl:async(url,init)=>{body=JSON.parse(init.body);return json({choices:[{message:{content:'translated'},finish_reason:'stop'}]})}});
  const result=await provider.invoke({prompt:'translate this',maxOutputTokens:8192});
  assert.equal(result.text,'translated');
  assert.equal(body.reasoning_effort,'low');
  assert.equal(body.include_reasoning,false);
  assert.equal(body.max_completion_tokens,8192);
  assert.equal('reasoning_format' in body,false,'Groq rejects reasoning_format for gpt-oss');
});

test('empty Groq and OpenRouter answers carry the finish reason for diagnosis', async () => {
  const groq=createGroqFreeProvider({ENVIRONMENT:'test',GROQ_API_KEY:'gsk_test',EKODI_PROVIDER_GROQ_FREE_ENABLED:'true'},{fetchImpl:async()=>json({choices:[{message:{content:''},finish_reason:'length'}]})});
  await assert.rejects(()=>groq.invoke({prompt:'x'}),/groq_free_empty_response_length/);
  let body=null;
  const openrouter=createOpenRouterFreeProvider({ENVIRONMENT:'test',OPENROUTER_API_KEY:'sk-or-test',EKODI_PROVIDER_OPENROUTER_FREE_ENABLED:'true'},{fetchImpl:async(url,init)=>{body=JSON.parse(init.body);return json({choices:[{message:{content:null},finish_reason:'length'}]})}});
  await assert.rejects(()=>openrouter.invoke({prompt:'x',maxOutputTokens:4096}),/openrouter_free_empty_response_length/);
  assert.deepEqual(body.reasoning,{effort:'low',exclude:true});
  assert.equal(body.max_tokens,4096);
});

test('OpenRouter credential probe reads the real free-model counter without a chat request', async () => {
  const urls=[];
  const probe=await probeOpenRouterFreeCredential({OPENROUTER_API_KEY:'sk-or-test'},{fetchImpl:async url=>{urls.push(String(url));return json({data:{is_free_tier:true,free_model_daily_requests:{limit:50,remaining:7,used:43}}})}});
  assert.deepEqual(urls,['https://openrouter.ai/api/v1/key']);
  assert.equal(probe.quota.limit,50);
  assert.equal(probe.quota.remainingRequests,7);
  await assert.rejects(()=>probeOpenRouterFreeCredential({OPENROUTER_API_KEY:'bad'},{fetchImpl:async()=>json({error:{code:401,message:'No auth'}},401)}),error=>error.status===401);
});

test('Groq credential probe lists models instead of spending a completion', async () => {
  const urls=[];
  await probeGroqFreeCredential({GROQ_API_KEY:'gsk_test'},{fetchImpl:async url=>{urls.push(String(url));return json({data:[]})}});
  assert.deepEqual(urls,['https://api.groq.com/openai/v1/models']);
});

function healthDb({row,provenAt}){
  const writes=[];
  return {
    writes,
    prepare(sql){
      const stmt={args:[],bind(...args){this.args=args;return this},
        async all(){if(sql.startsWith('SELECT * FROM ai_provider_registry'))return{results:[row]};return{results:[]}},
        async first(){if(sql.includes('MAX(created_at) AS proven_at'))return{proven_at:provenAt};return null},
        async run(){writes.push({sql,args:this.args});return{meta:{changes:1}}}};
      return stmt;
    }
  };
}

test('scheduled health uses the zero-quota probe while a real generation proof is fresh', async () => {
  const now=Date.parse('2026-10-19T03:00:00Z');
  const row={provider_id:'openrouter-free',enabled:1,priority:20,default_model:'openrouter/free',secret_binding:'OPENROUTER_API_KEY',health_status:'error',last_checked_at:'2026-10-19T01:00:00Z'};
  const DB=healthDb({row,provenAt:'2026-10-18T22:00:00Z'});
  const urls=[];const originalFetch=globalThis.fetch;
  globalThis.fetch=async url=>{urls.push(String(url));if(String(url).endsWith('/api/v1/key'))return json({data:{free_model_daily_requests:{limit:50,remaining:50,used:0}}});throw new Error('chat_completion_must_not_run')};
  try{
    const result=await runAiProviderHealthSchedule({DB,OPENROUTER_API_KEY:'sk-or-test',EKODI_PROVIDER_OPENROUTER_FREE_ENABLED:'true'},{now});
    assert.equal(result.results[0].mode,'credential-probe');
    assert.equal(result.results[0].status,'healthy');
    assert.deepEqual(urls,['https://openrouter.ai/api/v1/key']);
    assert.ok(DB.writes.some(item=>item.sql.includes("health_status='healthy'")));
    assert.ok(DB.writes.some(item=>item.sql.includes('ai_provider_quota_state')&&item.args.includes('available')),'real counter clears a stale exhausted state after reset');
    assert.ok(DB.writes.some(item=>item.sql.includes('INSERT INTO ai_provider_calls')&&item.args.includes('health-probe')));
  }finally{globalThis.fetch=originalFetch}
});

test('scheduled health falls back to a full generation check when no recent real generation exists', async () => {
  const now=Date.parse('2026-10-19T03:00:00Z');
  const DB=healthDb({row:{provider_id:'groq-free'},provenAt:'2026-10-17T00:00:00Z'});
  assert.equal(await shouldUseCredentialProbe({DB},'groq-free',now),false);
  assert.equal(await shouldUseCredentialProbe({DB:healthDb({row:{},provenAt:'2026-10-19T00:00:00Z'})},'groq-free',now),true);
  assert.equal(await shouldUseCredentialProbe({DB:healthDb({row:{},provenAt:'2026-10-19T00:00:00Z'})},'cloudflare-workers-ai',now),false,'Workers AI keeps cheap real generation checks');
});

test('gateway traffic success refreshes provider health and credential failures open the circuit', async () => {
  const writes=[];
  const registry={'groq-free':{provider_id:'groq-free',enabled:1,priority:30,default_model:'openai/gpt-oss-20b',secret_binding:'GROQ_API_KEY',health_status:'healthy',last_checked_at:new Date().toISOString()},
    gemini:{provider_id:'gemini',enabled:1,priority:10,default_model:'gemini-3.7-flash',secret_binding:'GEMINI_API_KEY',health_status:'healthy',last_checked_at:new Date().toISOString()}};
  const DB={batch:async()=>[],prepare(sql){const stmt={args:[],bind(...args){this.args=args;return this},
    async first(){if(sql.startsWith('SELECT COUNT(*) calls'))return{calls:0,cost:0,input_tokens:0,cached_input_tokens:0,output_tokens:0};if(sql.startsWith('SELECT * FROM ai_provider_registry WHERE'))return registry[this.args[0]]||null;if(sql.startsWith('SELECT * FROM ai_provider_routes WHERE'))return{primary_provider:'gemini',fallback_json:'["groq-free"]',model_override:''};return null},
    async all(){return{results:[]}},
    async run(){writes.push({sql,args:this.args});if(sql.includes('call_count=call_count+1'))return{meta:{changes:1}};return{meta:{changes:1}}}};return stmt}};
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async url=>{
    if(String(url).includes('generativelanguage.googleapis.com'))return json({error:{code:400,status:'INVALID_ARGUMENT',message:'API key not valid',details:[{reason:'API_KEY_INVALID'}]}},400);
    if(String(url).includes('api.groq.com'))return json({choices:[{message:{content:'ok'},finish_reason:'stop'}]});
    throw new Error('unexpected '+url);
  };
  try{
    const result=await invokeAiProviderCapability({DB,ENVIRONMENT:'test',GEMINI_API_KEY:'bad-key',GROQ_API_KEY:'gsk_test',EKODI_PROVIDER_GROQ_FREE_ENABLED:'true'},{capability:'translation',input:'hello'});
    assert.equal(result.provider,'groq-free');
    const healthWrites=writes.filter(item=>item.sql.startsWith('UPDATE ai_provider_registry SET health_status'));
    assert.ok(healthWrites.some(item=>item.sql.includes("'error'")&&item.args.includes('gemini')),'invalid Gemini key opens its circuit from real traffic');
    assert.ok(healthWrites.some(item=>item.sql.includes("'healthy'")&&item.args.includes('groq-free')),'successful Groq traffic refreshes its verification');
  }finally{globalThis.fetch=originalFetch}
});
