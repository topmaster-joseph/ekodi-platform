import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AI_FREE_QUOTA_POLICY,
  classifyFreeQuotaError,
  configuredFreeProviderIds,
  configuredRuntimeFreeProviderIds,
  freePoolSnapshot,
  hasAlternateZeroCostExecution,
  recordFreeProviderOutcomeAndAlert,
} from '../ai-free-quota.js';

test('free quota policy never auto escalates to paid APIs',()=>{
  assert.equal(AI_FREE_QUOTA_POLICY.paidAutoEscalation,false);
  assert.equal(AI_FREE_QUOTA_POLICY.paidDecisionRequired,true);
});

test('configured free provider inventory is provider-neutral',()=>{
  assert.deepEqual(configuredFreeProviderIds({
    cloudflareWorkersAi:true,
    geminiFree:true,
    openrouterFree:true,
    groqFree:true,
  }),['cloudflare-workers-ai','gemini-free','openrouter-free','groq-free']);
});

test('daily free-limit errors are classified as exhausted',()=>{
  const error=new Error('OPENROUTER_FREE_DAILY_FREE_LIMIT');
  error.status=429;
  error.quota={state:'exhausted',remainingRequests:0,resetAt:'2026-09-19T00:00:00.000Z'};
  const result=classifyFreeQuotaError('openrouter-free',error,Date.parse('2026-09-18T12:00:00Z'));
  assert.equal(result.state,'exhausted');
  assert.equal(result.remainingRequests,0);
  assert.equal(result.resetAt,'2026-09-19T00:00:00.000Z');
});

test('short provider rate limits are throttled instead of treated as daily exhaustion',()=>{
  const error=new Error('gemini_429_resource_exhausted');
  error.status=429;error.retryAfterSeconds=60;
  const result=classifyFreeQuotaError('gemini-free',error,Date.parse('2026-09-18T12:00:00Z'));
  assert.equal(result.state,'throttled');
  assert.equal(result.resetAt,'2026-09-18T12:01:00.000Z');
});

test('paid decision is required only when every configured free provider is exhausted and no zero-cost lane remains',async()=>{
  const rows=[
    {provider_id:'gemini-free',state:'exhausted',remaining_requests:0,remaining_tokens:null,reset_at:'2026-09-19T00:00:00.000Z',last_error:'quota',last_observed_at:'2026-09-18T11:00:00Z'},
    {provider_id:'cloudflare-workers-ai',state:'exhausted',remaining_requests:0,remaining_tokens:null,reset_at:'2026-09-19T00:00:00.000Z',last_error:'limit',last_observed_at:'2026-09-18T11:00:00Z'},
  ];
  const DB={prepare(){return{bind(){return this},async all(){return{results:rows}}}}};
  const snapshot=await freePoolSnapshot({DB},['gemini-free','cloudflare-workers-ai'],{nowMs:Date.parse('2026-09-18T12:00:00Z')});
  assert.equal(snapshot.allExhausted,true);
  assert.equal(snapshot.paidDecisionRequired,true);
  const withNode=await freePoolSnapshot({DB},['gemini-free','cloudflare-workers-ai'],{alternateZeroCostAvailable:true,nowMs:Date.parse('2026-09-18T12:00:00Z')});
  assert.equal(withNode.allExhausted,false);
  assert.equal(withNode.paidDecisionRequired,false);
});

test('account execution prevents premature paid escalation',()=>{
  assert.equal(hasAlternateZeroCostExecution({nodeProviders:['codex']}),true);
  assert.equal(hasAlternateZeroCostExecution({nodeProviders:[]}),false);
});


test('runtime free-provider inventory includes only configured executable free lanes',()=>{
  const ids=configuredRuntimeFreeProviderIds({
    EKODI_PROVIDER_WORKERS_AI_ENABLED:'true',
    AI:{async run(){}},
    GEMINI_API_KEY:'gemini-test-key',
    OPENROUTER_API_KEY:'openrouter-test-key',
    EKODI_PROVIDER_OPENROUTER_FREE_ENABLED:'true',
    GROQ_API_KEY:'groq-test-key',
    EKODI_PROVIDER_GROQ_FREE_ENABLED:'false',
  });
  assert.deepEqual(ids,['cloudflare-workers-ai','gemini-free','openrouter-free']);
});


test('exhausting the last configured free runtime provider creates a human paid-decision alert',async()=>{
  let quotaRow=null,alertRow=null;
  const DB={
    prepare(sql){
      const stmt={
        args:[],
        bind(...args){this.args=args;return this},
        async run(){
          if(sql.startsWith('INSERT INTO ai_provider_quota_state')){
            quotaRow={
              provider_id:this.args[0],cost_class:this.args[1],state:this.args[2],
              remaining_requests:this.args[3],remaining_tokens:this.args[4],reset_at:this.args[5],
              last_status_code:this.args[6],last_error:this.args[7],last_observed_at:this.args[8],updated_at:this.args[9],
            };
            return{meta:{changes:1}};
          }
          if(sql.startsWith('INSERT INTO ai_provider_alerts')){
            alertRow={
              id:this.args[0],alert_key:this.args[1],alert_type:this.args[2],severity:this.args[3],status:this.args[4],
              title:this.args[5],message:this.args[6],provider_ids_json:this.args[7],decision_required:1,decision:'',
              created_at:this.args[8],updated_at:this.args[9],
            };
            return{meta:{changes:1}};
          }
          return{meta:{changes:1}};
        },
        async all(){
          if(sql.startsWith('SELECT provider_id,state'))return{results:quotaRow?[quotaRow]:[]};
          return{results:[]};
        },
        async first(){
          if(sql.startsWith('SELECT * FROM ai_provider_alerts'))return alertRow;
          return null;
        },
      };
      return stmt;
    },
  };
  const error=new Error('WORKERS_AI_DAILY_CALL_LIMIT');
  error.status=429;
  error.quota={state:'exhausted',remainingRequests:0,resetAt:'2099-01-02T00:00:00.000Z'};
  const result=await recordFreeProviderOutcomeAndAlert({
    DB,
    EKODI_PROVIDER_WORKERS_AI_ENABLED:'true',
    AI:{async run(){}},
  },'cloudflare-workers-ai',{ok:false,error});
  assert.equal(result.snapshot.allExhausted,true);
  assert.equal(result.snapshot.paidDecisionRequired,true);
  assert.equal(result.alert.title,'무료 AI 사용 한도 소진');
  assert.equal(result.alert.decision_required,1);
});
