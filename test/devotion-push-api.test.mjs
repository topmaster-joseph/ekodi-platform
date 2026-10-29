import test from 'node:test';
import assert from 'node:assert/strict';
import {handleDevotionalPush} from '../message/devotion-push-api.js';
const request=(origin='https://ekodi.kr')=>new Request('https://ekodi.kr/api/message/devotional-push',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'});
test('fails closed without auth and storage',async()=>{
  assert.equal((await handleDevotionalPush(request())).status,503);
  assert.equal((await handleDevotionalPush(request(),{storage:{},authorize:async()=>null,rateLimit:async()=>true})).status,401);
});
test('blocks cross origin and invalid subscriptions',async()=>{
  const ctx={storage:{upsertSubscription:async()=>{throw Error('should not be called')}},authorize:async()=>({id:'user1'}),rateLimit:async()=>true};
  assert.equal((await handleDevotionalPush(request('https://evil.example'),ctx)).status,403);
  assert.equal((await handleDevotionalPush(request(),ctx)).status,400);
});
test('requires rate limit',async()=>{
  const ctx={storage:{},authorize:async()=>({id:'user1'}),rateLimit:async()=>false};
  assert.equal((await handleDevotionalPush(request(),ctx)).status,429);
});
