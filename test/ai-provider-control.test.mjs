import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { handleAiProviderControl, runAiProviderHealthSchedule, AI_PROVIDER_CONTROL_CONTRACT } from '../ai-provider-control.js';
import { createEkodiAiProviderRegistry } from '../ekodi-ai-provider-registry.js';

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('common provider gateway exposes allowed-origin CORS contract',async()=>{
  const response=await handleAiProviderControl(new Request('https://api.ekodi.kr/api/ai-modules/v1/providers/generate',{method:'OPTIONS',headers:{origin:'https://my.ekodi.kr'}}),{ALLOWED_ORIGINS:'https://my.ekodi.kr,https://admin.ekodi.kr'});
  assert.equal(response.status,204);
  assert.equal(response.headers.get('access-control-allow-origin'),'https://my.ekodi.kr');
  assert.equal(response.headers.get('x-ekodi-ai-provider-contract'),'ekodi.ai-provider.v1');
});

test('common provider gateway blocks unauthenticated generation before provider access',async()=>{
  const response=await handleAiProviderControl(new Request('https://api.ekodi.kr/api/ai-modules/v1/providers/generate',{method:'POST',headers:{origin:'https://my.ekodi.kr','content-type':'application/json'},body:JSON.stringify({capability:'documents',input:'test'})}),{ALLOWED_ORIGINS:'https://my.ekodi.kr'});
  assert.equal(response.status,401);
  assert.equal((await response.json()).error,'authentication_required');
});

test('provider registry honors managed enable priority and model overrides without exposing keys',()=>{
  const env={OPENAI_API_KEY:'openai-test-secret',EKODI_PROVIDER_OPENAI_ENABLED:'false',EKODI_PROVIDER_OPENAI_PRIORITY:'77',EKODI_PROVIDER_OPENAI_MODEL:'gpt-5.6-terra'};
  const provider=createEkodiAiProviderRegistry(env).find(item=>item.id==='openai');
  assert.equal(provider.available,false);
  assert.equal(provider.priority,77);
  assert.equal(provider.model,'gpt-5.6-terra');
  assert.equal(JSON.stringify(provider).includes('openai-test-secret'),false);
});

test('provider control requires human gates and never returns raw secrets',()=>{
  const api=read('ai-provider-control.js'),admin=read('admin-provider-control.js'),migration=read('migrations/0068_ai_provider_registry.sql');
  assert.match(api,/ai-provider-runtime-update/);
  assert.match(api,/ai-provider-route-update/);
  assert.match(api,/ai-provider-secret-connect/);
  assert.match(api,/valueReturned:false/);
  assert.match(api,/store:false/);
  assert.doesNotMatch(admin,/localStorage/);
  assert.match(admin,/type=\"password\"/);
  assert.match(migration,/ai_provider_calls/);
  assert.match(migration,/ai_provider_audit/);
  assert.equal(AI_PROVIDER_CONTROL_CONTRACT.gateway,'/api/ai-modules/v1/providers/generate');
});


test('scheduled provider health performs a bounded real provider probe contract',async()=>{
  const writes=[];
  const row={provider_id:'openai',enabled:1,priority:10,default_model:'gpt-5.6-terra',secret_binding:'OPENAI_API_KEY',health_status:'unknown',last_checked_at:null};
  const DB={prepare(sql){const stmt={args:[],bind(...args){this.args=args;return this},async all(){if(sql.startsWith('SELECT * FROM ai_provider_registry'))return{results:[row]};return{results:[]}},async first(){return null},async run(){writes.push({sql,args:this.args});return{meta:{changes:1}}}};return stmt}};
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async(url)=>{assert.equal(String(url),'https://api.openai.com/v1/responses');return new Response(JSON.stringify({model:'gpt-5.6-terra',output_text:'EKODI_PROVIDER_OK',usage:{input_tokens:7,output_tokens:3}}),{status:200,headers:{'content-type':'application/json'}})};
  try{const result=await runAiProviderHealthSchedule({DB,OPENAI_API_KEY:'test-key-1234567890'},{now:Date.parse('2026-09-08T00:00:00Z')});assert.equal(result.ok,true);assert.equal(result.checked,1);assert.equal(result.results[0].status,'healthy');assert.ok(writes.some(item=>item.sql.includes('UPDATE ai_provider_registry SET health_status')));assert.ok(writes.some(item=>item.sql.includes('INSERT INTO ai_provider_calls')))}finally{globalThis.fetch=originalFetch}
});

test('mission control schedules provider health without delaying core work',()=>{const source=read('mission-control-entry-worker.js');assert.match(source,/runAiProviderHealthSchedule/);assert.match(source,/ctx\.waitUntil\(aiProviderHealth\)/);});
