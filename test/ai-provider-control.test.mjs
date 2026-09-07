import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { handleAiProviderControl, AI_PROVIDER_CONTROL_CONTRACT } from '../ai-provider-control.js';
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
