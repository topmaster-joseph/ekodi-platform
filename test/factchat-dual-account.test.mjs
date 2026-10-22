import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { invokeAiProviderCapability, runAiProviderHealthSchedule, AI_PROVIDER_CONTROL_CONTRACT } from '../ai-provider-control.js';
import { createFactChatGatewayProvider, probeFactChatGatewayCredential, factChatBaseUrl, FACTCHAT_ACCOUNTS, FACTCHAT_GATEWAY_DEFAULT_BASE_URL } from '../factchat-gateway-provider-adapter.js';

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const EKODI_KEY='fc_ekodi_test_key_1234567890';
const MOKPO_KEY='fc_mokpo_test_key_1234567890';
const NOW=new Date().toISOString();

function gatewayDb({route,rows={}}){
  const writes=[];
  const DB={
    writes,
    batch:async()=>[],
    prepare(sql){const stmt={args:[],bind(...args){this.args=args;return this},
      async first(){
        if(sql.startsWith('SELECT COUNT(*) calls'))return{calls:0,cost:0,input_tokens:0,cached_input_tokens:0,output_tokens:0};
        if(sql.startsWith('SELECT * FROM ai_provider_registry WHERE'))return rows[this.args[0]]||null;
        if(sql.startsWith('SELECT * FROM ai_provider_routes WHERE'))return route;
        return null},
      async all(){if(sql.startsWith('SELECT * FROM ai_provider_registry'))return{results:Object.values(rows)};return{results:[]}},
      async run(){writes.push({sql,args:this.args});return{meta:{changes:1}}}};return stmt}
  };
  return DB;
}
const row=(id,extra={})=>({provider_id:id,enabled:1,priority:90,default_model:'gpt-5.6-luna',secret_binding:id==='factchat-ekodi'?'FACTCHAT_EKODI_API_KEY':'FACTCHAT_MOKPO_API_KEY',health_status:'healthy',last_checked_at:NOW,...extra});
const chatOk=model=>new Response(JSON.stringify({model,choices:[{message:{content:'factchat-ok'}}],usage:{prompt_tokens:11,completion_tokens:4}}),{status:200,headers:{'content-type':'application/json'}});

async function withFetch(handler,run){const original=globalThis.fetch;globalThis.fetch=handler;try{return await run()}finally{globalThis.fetch=original}}

test('canonical free-first chain is unchanged and FactChat accounts are opt-in route targets only',()=>{
  assert.deepEqual(AI_PROVIDER_CONTROL_CONTRACT.providerOrder,['cloudflare-workers-ai','gemini','openrouter-free','groq-free','cerebras-free','qwen-free','deepseek-free-credit','huggingface-free-credit','openai','anthropic']);
  assert.deepEqual([...AI_PROVIDER_CONTROL_CONTRACT.optInProviders],['factchat-ekodi','factchat-institution']);
  assert.ok(AI_PROVIDER_CONTROL_CONTRACT.providers.includes('factchat-institution'));
});

test('accounts keep separate keys, base URLs, approval flags and funding labels',()=>{
  const { ekodi, institution }=FACTCHAT_ACCOUNTS;
  assert.notEqual(ekodi.keyBinding,institution.keyBinding);
  assert.equal(ekodi.approvalBinding,'');
  assert.equal(institution.approvalBinding,'EKODI_FACTCHAT_INSTITUTION_USE_APPROVED');
  assert.equal(ekodi.funding,'ekodi-sponsored');
  assert.equal(institution.funding,'institution-sponsored');
  assert.equal(ekodi.costClass,'paid-opt-in');
});

test('default routing never reaches either FactChat account even when both keys exist',async()=>{
  const calls=[];
  await withFetch(async url=>{calls.push(String(url));if(String(url).includes('generativelanguage.googleapis.com'))return new Response(JSON.stringify({candidates:[{content:{parts:[{text:'free-ok'}]}}]}),{status:200,headers:{'content-type':'application/json'}});throw new Error('unexpected_call')},async()=>{
    const result=await invokeAiProviderCapability({GEMINI_API_KEY:'configured',FACTCHAT_EKODI_API_KEY:EKODI_KEY,FACTCHAT_MOKPO_API_KEY:MOKPO_KEY,EKODI_FACTCHAT_INSTITUTION_USE_APPROVED:'true'},{input:'default chain'});
    assert.equal(result.provider,'gemini');
  });
  assert.equal(calls.some(url=>url.includes('mindlogic.ai')),false);
});

test('institution account is blocked before any network call until super admin approval is in effect',async()=>{
  let fetches=0;
  const DB=gatewayDb({route:{primary_provider:'factchat-institution',fallback_json:'[]',model_override:''},rows:{'factchat-institution':row('factchat-institution')}});
  await withFetch(async()=>{fetches+=1;throw new Error('must_not_call')},async()=>{
    await assert.rejects(invokeAiProviderCapability({DB,FACTCHAT_MOKPO_API_KEY:MOKPO_KEY},{capability:'documents',input:'needs approval'}),error=>error.message==='provider_unavailable'&&error.blocked.includes('factchat-institution'));
  });
  assert.equal(fetches,0);
  assert.ok(DB.writes.some(item=>item.sql.includes('ai_provider_routing_events')&&item.args.includes('institution-use-not-approved')));
});

test('approved institution route uses only the institutional key and records institution funding',async()=>{
  const seen=[];
  const DB=gatewayDb({route:{primary_provider:'factchat-institution',fallback_json:'[]',model_override:''},rows:{'factchat-institution':row('factchat-institution')}});
  await withFetch(async(url,init)=>{seen.push({url:String(url),auth:init?.headers?.authorization,body:JSON.parse(init.body)});return chatOk('gpt-5.6-luna')},async()=>{
    const result=await invokeAiProviderCapability({DB,FACTCHAT_MOKPO_API_KEY:MOKPO_KEY,FACTCHAT_EKODI_API_KEY:EKODI_KEY,EKODI_FACTCHAT_INSTITUTION_USE_APPROVED:'true'},{capability:'documents',system:'요약',input:'교직원 회의록 요약'});
    assert.equal(result.provider,'factchat-institution');
    assert.equal(result.text,'factchat-ok');
  });
  assert.equal(seen.length,1);
  assert.equal(seen[0].url,`${FACTCHAT_GATEWAY_DEFAULT_BASE_URL}/chat/completions/`);
  assert.equal(seen[0].auth,`Bearer ${MOKPO_KEY}`);
  assert.equal(seen[0].body.max_completion_tokens>0,true);
  assert.equal('temperature' in seen[0].body,false);
  const meter=DB.writes.find(item=>item.sql.includes('api_usage_events'));
  assert.ok(meter,'usage must be metered');
  assert.ok(meter.args.includes('institution-sponsored'));
  assert.equal(meter.args.includes('ekodi-sponsored'),false);
});

test('EKODI account spends credits only with an explicit delegated budget',async()=>{
  const route={primary_provider:'factchat-ekodi',fallback_json:'[]',model_override:''};
  let fetches=0;
  await withFetch(async()=>{fetches+=1;throw new Error('must_not_call')},async()=>{
    await assert.rejects(invokeAiProviderCapability({DB:gatewayDb({route,rows:{'factchat-ekodi':row('factchat-ekodi')}}),FACTCHAT_EKODI_API_KEY:EKODI_KEY},{input:'no budget'}),error=>error.blocked?.includes('factchat-ekodi'));
  });
  assert.equal(fetches,0);
  const auths=[];
  await withFetch(async(url,init)=>{auths.push(init?.headers?.authorization);return chatOk('gpt-5.6-luna')},async()=>{
    const result=await invokeAiProviderCapability({DB:gatewayDb({route,rows:{'factchat-ekodi':row('factchat-ekodi')}}),FACTCHAT_EKODI_API_KEY:EKODI_KEY,FACTCHAT_MOKPO_API_KEY:MOKPO_KEY},{input:'approved budget',governance:{paidCommitment:true,explicitDelegatedBudget:true}});
    assert.equal(result.provider,'factchat-ekodi');
  });
  assert.deepEqual(auths,[`Bearer ${EKODI_KEY}`]);
});

test('base URL override accepts only official FactChat hosts over https',()=>{
  const account=FACTCHAT_ACCOUNTS.institution;
  assert.equal(factChatBaseUrl({FACTCHAT_MOKPO_BASE_URL:'https://evil.example.com/v1/gateway'},account),FACTCHAT_GATEWAY_DEFAULT_BASE_URL);
  assert.equal(factChatBaseUrl({FACTCHAT_MOKPO_BASE_URL:'http://factchat-cloud.mindlogic.ai/v1/gateway'},account),FACTCHAT_GATEWAY_DEFAULT_BASE_URL);
  assert.equal(factChatBaseUrl({FACTCHAT_MOKPO_BASE_URL:'https://factchat-cloud.mindlogic.ai/v1/gateway/'},account),'https://factchat-cloud.mindlogic.ai/v1/gateway');
  assert.equal(factChatBaseUrl({FACTCHAT_MOKPO_BASE_URL:'https://mokpo.factchat.bot/v1/gateway'},account),'https://mokpo.factchat.bot/v1/gateway');
  assert.equal(factChatBaseUrl({FACTCHAT_MOKPO_BASE_URL:'https://factchat-cloud.mindlogic.ai/v1/gateway?x=1'},account),FACTCHAT_GATEWAY_DEFAULT_BASE_URL);
  assert.equal(factChatBaseUrl({FACTCHAT_MOKPO_BASE_URL:'https://user:pw@factchat-cloud.mindlogic.ai/v1/gateway'},account),FACTCHAT_GATEWAY_DEFAULT_BASE_URL);
  // The EKODI key may never be pointed at an institution tenant host.
  assert.equal(factChatBaseUrl({FACTCHAT_EKODI_BASE_URL:'https://mokpo.factchat.bot/v1/gateway'},FACTCHAT_ACCOUNTS.ekodi),FACTCHAT_GATEWAY_DEFAULT_BASE_URL);
  assert.equal(factChatBaseUrl({FACTCHAT_EKODI_BASE_URL:'https://other.factchat.bot/v1/gateway'},FACTCHAT_ACCOUNTS.ekodi),FACTCHAT_GATEWAY_DEFAULT_BASE_URL);
});

test('end-user public gateway cannot spend institution credits unless explicitly opened',async()=>{
  let fetches=0;
  const route={primary_provider:'factchat-institution',fallback_json:'[]',model_override:''};
  await withFetch(async()=>{fetches+=1;return chatOk('gpt-5.6-luna')},async()=>{
    await assert.rejects(invokeAiProviderCapability({DB:gatewayDb({route,rows:{'factchat-institution':row('factchat-institution')}}),FACTCHAT_MOKPO_API_KEY:MOKPO_KEY,EKODI_FACTCHAT_INSTITUTION_USE_APPROVED:'true'},{input:'public',governance:{channel:'public-gateway'}}),error=>error.blocked?.includes('factchat-institution'));
    assert.equal(fetches,0);
    const opened=await invokeAiProviderCapability({DB:gatewayDb({route,rows:{'factchat-institution':row('factchat-institution')}}),FACTCHAT_MOKPO_API_KEY:MOKPO_KEY,EKODI_FACTCHAT_INSTITUTION_USE_APPROVED:'true',EKODI_FACTCHAT_INSTITUTION_PUBLIC_GATEWAY:'true'},{input:'public',governance:{channel:'public-gateway'}});
    assert.equal(opened.provider,'factchat-institution');
  });
  assert.match(read('ai-provider-control.js'),/governance:\{channel:'public-gateway'\}/);
});

test('institution daily call cap blocks before any network call once exhausted',async()=>{
  let fetches=0;
  const DB=gatewayDb({route:{primary_provider:'factchat-institution',fallback_json:'[]',model_override:''},rows:{'factchat-institution':row('factchat-institution')}});
  const prepare=DB.prepare.bind(DB);
  DB.prepare=sql=>{const stmt=prepare(sql);if(sql.startsWith('UPDATE ai_provider_daily_budget')){stmt.run=async()=>({meta:{changes:0}})}return stmt};
  await withFetch(async()=>{fetches+=1;throw new Error('must_not_call')},async()=>{
    await assert.rejects(invokeAiProviderCapability({DB,FACTCHAT_MOKPO_API_KEY:MOKPO_KEY,EKODI_FACTCHAT_INSTITUTION_USE_APPROVED:'true'},{input:'over cap'}),error=>error.blocked?.includes('factchat-institution'));
  });
  assert.equal(fetches,0);
});

test('credential probe lists models without generating and surfaces auth failures',async()=>{
  const urls=[];
  await withFetch(async(url,init)=>{urls.push({url:String(url),method:init?.method||'GET'});return new Response(JSON.stringify({data:[{id:'gpt-5.6-luna'},{id:'claude-sonnet-5'}]}),{status:200})},async()=>{
    const result=await probeFactChatGatewayCredential({FACTCHAT_MOKPO_API_KEY:MOKPO_KEY},{account:'institution'});
    assert.equal(result.ok,true);assert.equal(result.models,2);
  });
  assert.equal(urls[0].method,'GET');
  assert.match(urls[0].url,/\/models\/\?type=llm$/);
  await withFetch(async()=>new Response(JSON.stringify({detail:{code:401,message:'authentication_error - Invalid API key'}}),{status:401}),async()=>{
    const error=await probeFactChatGatewayCredential({FACTCHAT_EKODI_API_KEY:EKODI_KEY},{account:'ekodi'}).catch(e=>e);
    assert.equal(error.status,401);
    assert.match(error.message,/^factchat_ekodi_401/);
  });
});

test('adapter refuses institution traffic without approval even if called directly',async()=>{
  const provider=createFactChatGatewayProvider({FACTCHAT_MOKPO_API_KEY:MOKPO_KEY},{account:'institution',fetchImpl:async()=>{throw new Error('must_not_call')}});
  assert.equal(provider.available,false);
  await assert.rejects(provider.invoke({input:'x'}),/factchat_institution_use_not_approved/);
});

test('scheduled health probes both accounts at zero credit cost and skips unapproved institution use',async()=>{
  const rows={'factchat-ekodi':row('factchat-ekodi',{health_status:'unknown',last_checked_at:null}),'factchat-institution':row('factchat-institution',{health_status:'unknown',last_checked_at:null})};
  const urls=[];
  await withFetch(async(url,init)=>{urls.push({url:String(url),method:init?.method||'GET'});return new Response(JSON.stringify({data:[{id:'gpt-5.6-luna'}]}),{status:200})},async()=>{
    const result=await runAiProviderHealthSchedule({DB:gatewayDb({rows}),FACTCHAT_EKODI_API_KEY:EKODI_KEY,FACTCHAT_MOKPO_API_KEY:MOKPO_KEY},{now:Date.now()});
    const ekodi=result.results.find(item=>item.provider==='factchat-ekodi'),institution=result.results.find(item=>item.provider==='factchat-institution');
    assert.equal(ekodi.status,'healthy');assert.equal(ekodi.mode,'credential-probe');
    assert.equal(institution.status,'institution-use-not-approved');assert.equal(institution.checked,false);
  });
  assert.equal(urls.length,1);
  assert.equal(urls.every(item=>item.method==='GET'&&!item.url.includes('/chat/completions')),true);
});

test('institution controls are super_admin only and approval is re-affirmed on each save',()=>{
  const api=read('ai-provider-control.js'),ui=read('admin-provider-control.js');
  assert.match(api,/INSTITUTION_ACCOUNT_SUPER_ADMIN_REQUIRED/);
  assert.match(api,/clean\(session\?\.role,40\)\.toLowerCase\(\)==='super_admin'/);
  assert.match(api,/explicitEachSave=DEFAULTS\[id\]\?\.accountClass==='institution'/);
  assert.match(api,/institution_account_approval_required/);
  assert.match(ui,/https:\/\/mokpo\.factchat\.bot\/dashboard\/developers/);
  assert.match(ui,/기관계정 사용 선택·키 연결·라우팅 지정은 최고관리자만/);
  assert.match(ui,/p\.freeGuardHint/);
  // Unchecking approval revokes at runtime and in the registry, and the box is never pre-checked.
  assert.match(api,/await putRuntimeSecret\(env,freeGuardBinding,'false'\);await putRuntimeSecret\(env,bindings\.enabled,'false'\)/);
  assert.match(api,/provider\.institution\.revoked/);
  assert.match(ui,/p\.freeGuardConfigured&&p\.accountClass!=='institution'\?'checked'/);
  // Manual check is gated the same way as every other institution control.
  assert.match(api,/async function checkProvider\(request,env,session,id\)\{if\(!PROVIDERS\.has\(id\)\)return json\(request,env,\{error:'unknown_provider'\},404\);\{const denied=institutionGateDenied/);
});

test('migration is additive, starts both accounts disabled and leaves every fallback chain untouched',()=>{
  const migration=read('migrations/0200_factchat_dual_account_providers.sql');
  assert.match(migration,/INSERT OR IGNORE INTO ai_provider_registry/);
  assert.match(migration,/'factchat-ekodi', 'FactChat · 에코디 계정', 'official-api', 0,/);
  assert.match(migration,/'factchat-institution', 'FactChat · 국립목포대 기관계정', 'official-api', 0,/);
  assert.doesNotMatch(migration,/^\s*UPDATE\s/im);
  assert.doesNotMatch(migration,/^\s*(DROP|DELETE)\s/im);
});

test('AI operations center renders the approval checkbox and sends the explicit confirmation',()=>{
  const center=read('ai-operations-center-admin.js');
  assert.match(center,/data-provider-guard/);
  assert.match(center,/item\.freeGuardConfigured && item\.accountClass !== 'institution' \? 'checked' : ''/);
  assert.match(center,/body: JSON\.stringify\(\{ enabled, priority, defaultModel, freeGuardConfirmed \}\)/);
  assert.match(center,/institution_account_approval_required/);
  assert.match(center,/\.aic-row\.provider \.aic-guard\{grid-column:1\/-1/);
});

test('AI operations center edits dispatch the Shared Site Core release that bundles it',()=>{
  assert.match(read('scripts/converge-orchestrated-pr-merge.mjs'),/file==='ai-operations-center-admin\.js'\|\|/);
  assert.match(read('.github/workflows/deploy-site-core.yml'),/- 'ai-operations-center-admin\.js'/);
  assert.match(read('scripts/build.mjs'),/'ai-operations-center-admin\.js'/);
});

test('gateway requests carry a User-Agent and an edge 1010 block is not reported as a rejected key',async()=>{
  const seen=[];
  await withFetch(async(url,init)=>{seen.push(init?.headers||{});return new Response(JSON.stringify({data:[{id:'gpt-5.6-luna'}]}),{status:200})},async()=>{
    await probeFactChatGatewayCredential({FACTCHAT_MOKPO_API_KEY:MOKPO_KEY},{account:'institution'});
  });
  assert.match(seen[0]['user-agent'],/^EKODI-/);
  const chatHeaders=[];
  await withFetch(async(url,init)=>{chatHeaders.push(init?.headers||{});return chatOk('gpt-5.6-luna')},async()=>{
    await createFactChatGatewayProvider({FACTCHAT_MOKPO_API_KEY:MOKPO_KEY,EKODI_FACTCHAT_INSTITUTION_USE_APPROVED:'true'},{account:'institution'}).invoke({input:'hi'});
  });
  assert.match(chatHeaders[0]['user-agent'],/^EKODI-/);
  await withFetch(async()=>new Response('error code: 1010',{status:403,headers:{'content-type':'text/plain'}}),async()=>{
    const error=await probeFactChatGatewayCredential({FACTCHAT_MOKPO_API_KEY:MOKPO_KEY},{account:'institution'}).catch(e=>e);
    assert.equal(error.edgeBlocked,true);
    assert.match(error.message,/edge_blocked_1010$/);
    const { describeProviderCheckDiagnostic }=await import('../ai-provider-control.js');
    assert.notEqual(describeProviderCheckDiagnostic(error).category,'authentication-error');
  });
});

function adminDb({role='super_admin',row:registry=row('factchat-institution'),budgetChanges=1}={}){
  const writes=[];
  return{writes,batch:async()=>[],prepare(sql){const stmt={args:[],bind(...args){this.args=args;return this},
    async first(){if(sql.includes('FROM sessions'))return{email:'owner@ekodi.kr',role,expires_at:'2999-01-01T00:00:00Z',elevated_until:null};if(sql.startsWith('SELECT * FROM ai_provider_registry WHERE'))return registry;if(sql.startsWith('SELECT COUNT(*) calls'))return{calls:0,cost:0,input_tokens:0,cached_input_tokens:0,output_tokens:0};return null},
    async all(){return{results:[]}},
    async run(){writes.push({sql,args:this.args});if(sql.startsWith('UPDATE ai_provider_daily_budget'))return{meta:{changes:budgetChanges}};return{meta:{changes:1}}}};return stmt}};
}
const adminEnv=(DB,extra={})=>({DB,ADMIN_EMAIL:'owner@ekodi.kr',FACTCHAT_MOKPO_API_KEY:MOKPO_KEY,EKODI_FACTCHAT_INSTITUTION_USE_APPROVED:'true',...extra});
const adminRequest=(path,init={})=>new Request(`https://ekodi.kr/api/ai-modules/v1/providers/admin/factchat-institution/${path}`,{...init,headers:{authorization:'Bearer admin-session-token',...(init.headers||{})}});

test('institution playground is super_admin only, approval-gated, capped and billed to the institution',async()=>{
  const { handleAiProviderControl }=await import('../ai-provider-control.js');
  const run=body=>adminRequest('playground',{method:'POST',headers:{'content-type':'application/json','x-ekodi-confirm-impact':'factchat-institution-playground'},body:JSON.stringify(body)});
  let fetches=0;
  await withFetch(async(url,init)=>{fetches+=1;assert.match(String(url),/\/chat\/completions\/$/);assert.equal(init.headers.authorization,`Bearer ${MOKPO_KEY}`);return chatOk('claude-haiku-5-5')},async()=>{
    // non-super admin
    let response=await handleAiProviderControl(run({input:'x'}),adminEnv(adminDb({role:'admin'})));
    assert.equal(response.status,403);
    // approval withdrawn
    response=await handleAiProviderControl(run({input:'x'}),adminEnv(adminDb(),{EKODI_FACTCHAT_INSTITUTION_USE_APPROVED:'false'}));
    assert.equal(response.status,409);
    // disabled in registry
    response=await handleAiProviderControl(run({input:'x'}),adminEnv(adminDb({row:row('factchat-institution',{enabled:0})})));
    assert.equal((await response.json()).error,'institution_account_disabled');
    // missing confirmation header
    response=await handleAiProviderControl(adminRequest('playground',{method:'POST',body:'{"input":"x"}'}),adminEnv(adminDb()));
    assert.equal(response.status,428);
    // daily cap reached
    response=await handleAiProviderControl(run({input:'x'}),adminEnv(adminDb({budgetChanges:0})));
    assert.equal(response.status,429);
    assert.equal(fetches,0,'no gate failure may reach the gateway');
    // happy path
    const DB=adminDb();
    response=await handleAiProviderControl(run({input:'회의록 정리',model:'claude-haiku-5-5'}),adminEnv(DB));
    const body=await response.json();
    assert.equal(body.ok,true);assert.equal(body.text,'factchat-ok');assert.equal(body.model,'claude-haiku-5-5');
    assert.ok(DB.writes.some(item=>item.sql.includes('api_usage_events')&&item.args.includes('institution-sponsored')));
    assert.ok(DB.writes.some(item=>item.sql.includes('ai_provider_audit')&&item.args.includes('provider.institution.playground')));
  });
  assert.equal(fetches,1);
});

test('institution model list is a zero-credit GET and returns model ids',async()=>{
  const { handleAiProviderControl }=await import('../ai-provider-control.js');
  const calls=[];
  await withFetch(async(url,init)=>{calls.push({url:String(url),method:init?.method||'GET'});return new Response(JSON.stringify({data:[{id:'gpt-5.6-luna'},{id:'claude-haiku-5-5'}]}),{status:200})},async()=>{
    const response=await handleAiProviderControl(adminRequest('models'),adminEnv(adminDb()));
    const body=await response.json();
    assert.deepEqual(body.models,['gpt-5.6-luna','claude-haiku-5-5']);
  });
  assert.equal(calls.length,1);assert.equal(calls[0].method,'GET');assert.match(calls[0].url,/\/models\/\?type=llm$/);
  const ui=read('admin-provider-control.js');
  assert.match(ui,/p\.accountClass==='institution'&&configured&&p\.enabled\?institutionPlayground\(p\)/);
  assert.match(ui,/'x-ekodi-confirm-impact':'factchat-institution-playground'/);
});
