import test from 'node:test';
import assert from 'node:assert/strict';
import {assertFreeProviderUnlocked,recordFreeProviderOutcome,reserveFreeDailyRequest} from '../ai-free-quota.js';

const later='2035-11-12T00:00:00.000Z';
const earlier='2020-01-01T00:00:00.000Z';
function db(state=null,{throwSelect=false}={}){
  const calls=[];
  const DB={prepare(sql){
    const entry={sql,params:[]};calls.push(entry);
    return {bind(...args){entry.params=args;return this},
      async first(){
        if(throwSelect)throw new Error('quota store disconnected');
        if(sql.includes('FROM ai_provider_quota_state'))return state;
        if(sql.includes('FROM ai_provider_daily_budget'))return {call_count:1};
        return null;
      },
      async run(){return {meta:{changes:1}}}};
  }};
  return {DB,calls};
}
test('an active provider 429 lock stops new paid-risk call before daily budget is touched',async()=>{
 const d=db({state:'exhausted',reset_at:later});
 await assert.rejects(()=>reserveFreeDailyRequest({ENVIRONMENT:'production',DB:d.DB},'groq-free',50),
   e=>e.status===429&&e.message==='FREE_PROVIDER_QUOTA_LOCKED');
 assert.ok(d.calls.every(x=>!x.sql.includes('ai_provider_daily_budget')));
});
test('short rate limit also blocks independent free adapters',async()=>{
 const d=db({state:'throttled',reset_at:later});
 await assert.rejects(()=>assertFreeProviderUnlocked({ENVIRONMENT:'production',DB:d.DB},'openrouter-free'),
   e=>e.status===429);
});
test('reset-due lock permits only the separately bounded daily-ledger reservation',async()=>{
 const d=db({state:'exhausted',reset_at:earlier});
 const r=await reserveFreeDailyRequest({ENVIRONMENT:'production',DB:d.DB},'huggingface-free-credit',50);
 assert.equal(r.used,1);
 assert.ok(d.calls.some(x=>x.sql.startsWith('UPDATE ai_provider_daily_budget')));
});
test('invalid or unknown quota state cannot fake an unlocked active lock',async()=>{
 const d=db({state:'exhausted',reset_at:'bad-date'});
 await assert.rejects(()=>assertFreeProviderUnlocked({ENVIRONMENT:'production',DB:d.DB},'groq-free'),/FREE_PROVIDER_QUOTA_LOCKED/);
});
test('production provider locks fail closed if the D1 quota table is unavailable',async()=>{
 const broken=db(null,{throwSelect:true});
 await assert.rejects(()=>assertFreeProviderUnlocked({ENVIRONMENT:'production',DB:broken.DB},'groq-free'),/FREE_QUOTA_STATE_UNAVAILABLE/);
 await assert.rejects(()=>assertFreeProviderUnlocked({ENVIRONMENT:'production'},'groq-free'),/FREE_QUOTA_DB_UNAVAILABLE/);
});
test('no production state store mutation in a non-production isolated test',async()=>{
 const result=await assertFreeProviderUnlocked({ENVIRONMENT:'test'},'openrouter-free');
 assert.equal(result.state,'unverified');
});
test('delayed success write cannot override an unexpired exhausted or throttled quota lock',async()=>{
 const d=db();
 await recordFreeProviderOutcome({DB:d.DB},'groq-free',{ok:true,quota:{remainingRequests:4}});
 const upsert=d.calls.find(x=>x.sql.includes('ON CONFLICT(provider_id)'));
 assert.ok(upsert);
 assert.match(upsert.sql,/WHERE NOT\s*\(/);
 assert.match(upsert.sql,/excluded\.state='available'/);
 assert.match(upsert.sql,/ai_provider_quota_state\.state IN \('exhausted','throttled'\)/);
 assert.match(upsert.sql,/strftime\('%s',ai_provider_quota_state\.reset_at\) IS NULL/);
});
