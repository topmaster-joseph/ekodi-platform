import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../ai-control-worker.js';

const url = path => 'https://ekodi.kr'+path;
const request=(path, method='GET',body,token='')=>new Request(url(path),{
  method,headers:{...(body?{'content-type':'application/json'}:{}),...(token?{authorization:'Bearer '+token}:{})},
  ...(body?{body:JSON.stringify(body)}:{}),
});
test('public model status excludes unavailable Ollama and does not disclose credentials',async()=>{
  const response=await worker.fetch(request('/api/commons/chat/status'),{},null);
  assert.equal(response.status,200);
  const json=await response.json();
  assert.deepEqual(json.providers,{auto:false,ollama:false,gpt:false,claude:false,paidOptInRequired:true});
  assert.equal(JSON.stringify(json).includes('secret'),false);
});
test('all chat writes and local job lookups require a real member identity',async()=>{
  const body={mode:'auto',messages:[{role:'user',content:'안녕하세요'}]};
  const post=await worker.fetch(request('/api/commons/chat','POST',body),{},null);
  assert.equal(post.status,401);
  assert.equal((await post.json()).error,'authentication_required');
  const get=await worker.fetch(request('/api/commons/chat/jobs/00000000-0000-4000-8000-000000000123'),{},null);
  assert.equal(get.status,401);
});
test('paid GPT/Claude do not activate just because a key exists',async()=>{
  const oldFetch=globalThis.fetch;
  globalThis.fetch=async()=>new Response(JSON.stringify({id:'member-1',email:'member@example.test'}),{status:200,headers:{'content-type':'application/json'}});
  const env={
    SUPABASE_URL:'https://auth.example.test',SUPABASE_PUBLISHABLE_KEY:'public-test-key',
    OPENAI_API_KEY:'secret-test-key',ANTHROPIC_API_KEY:'secret-test-key',
    AI_COMMONS_PAID_CHAT_ENABLED:'false',
  };
  try{
    for(const mode of ['gpt','claude']){
      const response=await worker.fetch(request('/api/commons/chat','POST',{mode,messages:[{role:'user',content:'한글'}]},'test-token'),env,null);
      assert.equal(response.status,503);
      assert.equal((await response.json()).error,'paid_provider_not_enabled');
    }
  }finally{globalThis.fetch=oldFetch}
});
