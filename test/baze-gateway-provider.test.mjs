// BAZE-GATEWAY-20261022: EKODI's own gateway account reads BAZE_API_KEY and is applied
// (enabled or routed) only after the zero-credit model-list call succeeds.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { probeProviderActivation, invokeAiProviderCapability } from '../ai-provider-control.js';
import { createFactChatGatewayProvider, probeFactChatGatewayCredential, factChatApiKey, factChatKeyBindings, FACTCHAT_ACCOUNTS } from '../factchat-gateway-provider-adapter.js';

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const BAZE_KEY='baze_test_key_000000000000000000';
const LEGACY_KEY='fc_ekodi_legacy_key_1234567890';
const NOW=new Date().toISOString();
async function withFetch(handler,run){const original=globalThis.fetch;globalThis.fetch=handler;try{return await run()}finally{globalThis.fetch=original}}
const models=list=>new Response(JSON.stringify({data:list.map(id=>({id}))}),{status:200,headers:{'content-type':'application/json'}});

test('ekodi account prefers BAZE_API_KEY and keeps FACTCHAT_EKODI_API_KEY as a legacy alias',()=>{
  const { ekodi, institution }=FACTCHAT_ACCOUNTS;
  assert.deepEqual(factChatKeyBindings(ekodi),['BAZE_API_KEY','FACTCHAT_EKODI_API_KEY']);
  assert.equal(factChatApiKey({BAZE_API_KEY:BAZE_KEY,FACTCHAT_EKODI_API_KEY:LEGACY_KEY},ekodi),BAZE_KEY);
  assert.equal(factChatApiKey({FACTCHAT_EKODI_API_KEY:LEGACY_KEY},ekodi),LEGACY_KEY);
  assert.equal(factChatApiKey({},ekodi),'');
  // The institution account can never pick up EKODI's BAZE key, and vice versa.
  assert.deepEqual(factChatKeyBindings(institution),['FACTCHAT_MOKPO_API_KEY']);
  assert.equal(factChatApiKey({BAZE_API_KEY:BAZE_KEY},institution),'');
  assert.equal(factChatApiKey({FACTCHAT_MOKPO_API_KEY:'x'.repeat(20)},ekodi),'');
});

test('probe and invoke send the BAZE key as a bearer token to the official gateway',async()=>{
  const seen=[];
  await withFetch(async(url,init)=>{seen.push({url:String(url),auth:init?.headers?.authorization});return models(['gpt-5.6-luna'])},async()=>{
    const result=await probeFactChatGatewayCredential({BAZE_API_KEY:BAZE_KEY},{account:'ekodi'});
    assert.equal(result.ok,true);assert.equal(result.models,1);
  });
  assert.equal(seen[0].url,'https://factchat-cloud.mindlogic.ai/v1/gateway/models/?type=llm');
  assert.equal(seen[0].auth,`Bearer ${BAZE_KEY}`);
  const provider=createFactChatGatewayProvider({BAZE_API_KEY:BAZE_KEY},{account:'ekodi',fetchImpl:async()=>{throw new Error('unused')}});
  assert.equal(provider.available,true);
});

test('activation gate passes only when the model list call succeeds',async()=>{
  await withFetch(async()=>models(['gpt-5.6-luna','claude-sonnet-5']),async()=>{
    const gate=await probeProviderActivation({BAZE_API_KEY:BAZE_KEY},'factchat-ekodi');
    assert.equal(gate.ok,true);assert.equal(gate.models,2);
  });
});

test('activation gate refuses an invalid or foreign-deployment key (401)',async()=>{
  await withFetch(async()=>new Response(JSON.stringify({detail:{code:401,message:'Invalid API key'}}),{status:401}),async()=>{
    const gate=await probeProviderActivation({BAZE_API_KEY:BAZE_KEY},'factchat-ekodi');
    assert.equal(gate.ok,false);assert.match(gate.code,/^factchat_ekodi_401/);
    assert.equal(gate.diagnostic.category,'authentication-error');
  });
});

test('activation gate refuses a missing key, network failure and an empty model list',async()=>{
  const missing=await probeProviderActivation({},'factchat-ekodi');
  assert.equal(missing.ok,false);assert.match(missing.code,/factchat_ekodi_not_configured/);
  await withFetch(async()=>{throw new TypeError('fetch failed')},async()=>{
    const gate=await probeProviderActivation({BAZE_API_KEY:BAZE_KEY},'factchat-ekodi');
    assert.equal(gate.ok,false);
  });
  await withFetch(async()=>models([]),async()=>{
    const gate=await probeProviderActivation({BAZE_API_KEY:BAZE_KEY},'factchat-ekodi');
    assert.equal(gate.ok,false);assert.equal(gate.code,'gateway_model_list_empty');
  });
});

test('activation gate never calls the network for non-gateway providers',async()=>{
  await withFetch(async()=>{throw new Error('must_not_call')},async()=>{
    assert.equal((await probeProviderActivation({},'gemini')).ok,true);
    assert.equal((await probeProviderActivation({},'cloudflare-workers-ai')).ok,true);
  });
});

test('enable and route handlers run the gate before any runtime or registry write',()=>{
  const api=read('ai-provider-control.js');
  const update=api.slice(api.indexOf('async function updateProvider('),api.indexOf('async function decideCostAlert('));
  assert.ok(update.indexOf('activationProbe(env,id)')>0);
  assert.ok(update.indexOf('activationProbe(env,id)')<update.indexOf('syncProviderRuntime('));
  assert.ok(update.indexOf('activationProbe(env,id)')<update.indexOf('UPDATE ai_provider_registry'));
  assert.match(update,/provider_activation_probe_failed[^]*applied:false/);
  const route=api.slice(api.indexOf('async function updateRoute('),api.indexOf('async function connectSecret('));
  assert.ok(route.indexOf('activationProbe(env,target)')>0);
  assert.ok(route.indexOf('activationProbe(env,target)')<route.indexOf('INSERT INTO ai_provider_routes'));
});

test('routing works with only BAZE_API_KEY set (registry row still names the legacy binding)',async()=>{
  const rows={'factchat-ekodi':{provider_id:'factchat-ekodi',enabled:1,priority:80,default_model:'gpt-5.6-luna',secret_binding:'FACTCHAT_EKODI_API_KEY',health_status:'healthy',last_checked_at:NOW}};
  const route={capability:'documents',primary_provider:'factchat-ekodi',fallback_json:'[]',model_override:''};
  const DB={batch:async()=>[],prepare(sql){return{args:[],bind(...a){this.args=a;return this},async first(){if(sql.startsWith('SELECT COUNT(*) calls'))return{calls:0,cost:0,input_tokens:0,cached_input_tokens:0,output_tokens:0};if(sql.startsWith('SELECT * FROM ai_provider_registry WHERE'))return rows[this.args[0]]||null;if(sql.startsWith('SELECT * FROM ai_provider_routes WHERE'))return route;return null},async all(){return{results:Object.values(rows)}},async run(){return{meta:{changes:1}}}}}};
  const auth=[];
  await withFetch(async(url,init)=>{auth.push(init?.headers?.authorization);return new Response(JSON.stringify({model:'gpt-5.6-luna',choices:[{message:{content:'baze-ok'}}],usage:{prompt_tokens:3,completion_tokens:2}}),{status:200})},async()=>{
    const result=await invokeAiProviderCapability({DB,BAZE_API_KEY:BAZE_KEY},{capability:'documents',input:'요약',governance:{paidCommitment:true,explicitDelegatedBudget:true}});
    assert.equal(result.provider,'factchat-ekodi');
  });
  assert.ok(auth.includes(`Bearer ${BAZE_KEY}`));
});
