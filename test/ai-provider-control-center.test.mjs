import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {providerVerifiedForTraffic,invokeAiProviderCapability} from '../ai-provider-control.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('AI routing requires healthy, recent verified provider results',()=>{
  const now=Date.parse('2026-10-09T00:00:00Z');
  const at=delta=>new Date(now-delta).toISOString();
  assert.equal(providerVerifiedForTraffic({health_status:'healthy',last_checked_at:at(1000)},now),true);
  assert.equal(providerVerifiedForTraffic({health_status:'healthy',last_checked_at:at(3*60*60*1000+1)},now),false);
  assert.equal(providerVerifiedForTraffic({health_status:'unknown',last_checked_at:at(1000)},now),false);
  assert.equal(providerVerifiedForTraffic({health_status:'error',last_checked_at:at(1000)},now),false);
  assert.equal(providerVerifiedForTraffic({health_status:'healthy',last_checked_at:'invalid'},now),false);
  assert.equal(providerVerifiedForTraffic({health_status:'healthy',last_checked_at:new Date(now+60000).toISOString()},now),false);
});

test('unverified and missing registry rows cannot issue a real provider request',async()=>{
  const originalFetch=globalThis.fetch;
  let calls=0;
  globalThis.fetch=async()=>{calls++;throw Error('unverified provider was called')};
  let row={provider_id:'gemini',enabled:1,health_status:'unknown',default_model:'gemini-3.7-flash',secret_binding:'GEMINI_API_KEY'};
  const DB={batch:async()=>[],prepare(sql){
    return {bind(){return this},async first(){
      if(sql.startsWith('SELECT COUNT(*) calls'))return{calls:0,cost:0,input_tokens:0,cached_input_tokens:0,output_tokens:0};
      if(sql.startsWith('SELECT * FROM ai_provider_routes'))return{primary_provider:'gemini',fallback_json:'[]',model_override:''};
      if(sql.startsWith('SELECT * FROM ai_provider_registry WHERE'))return row;
      return null;
    },async all(){return{results:[]}},async run(){return{meta:{changes:1}}}};
  }};
  try{
    for(const missing of [false,true]){
      row=missing?null:{...row,health_status:'unknown'};
      await assert.rejects(invokeAiProviderCapability({DB,GEMINI_API_KEY:'configured'},{input:'private task'}),e=>e?.message==='provider_unavailable'&&e?.blocked?.includes('gemini'));
    }
    assert.equal(calls,0);
  }finally{globalThis.fetch=originalFetch}
});

test('operator control uses accessible four-tab navigation and one shared gateway',()=>{
  const admin=read('admin-provider-control.js');
  const runtime=read('ai-provider-control.js');
  assert.match(admin,/role="tablist"/);
  assert.match(admin,/aria-selected=/);
  assert.match(admin,/\['operations','운영'\]/);
  assert.match(admin,/\['connections','연결'\]/);
  assert.match(admin,/\['routing','라우팅'\]/);
  assert.match(admin,/\['logs','기록'\]/);
  assert.match(admin,/data-ai-open-provider/);
  assert.match(runtime,/const result=await invokeAiProviderCapability\(env,\{capability,system,input,maxOutputTokens\}\)/);
  assert.match(runtime,/stale-verification/);
  assert.match(runtime,/settingsChanged/);
});
