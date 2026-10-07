import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { EKODI_AI_DISCOVERY, EKODI_AI_DISCOVERY_PATH } from '../scripts/discovery-build.mjs';
import { EKODI_MCP_TOOLS, callEkodiMcpTool, handleEkodiMcpGateway } from '../ekodi-mcp-gateway.js';

const tool=name=>EKODI_MCP_TOOLS.find(item=>item.name===name);

test('canonical EKODI discovery binds both aliases to the apex MCP resource',()=>{
  assert.equal(EKODI_AI_DISCOVERY_PATH,'/.well-known/ekodi.json');
  assert.equal(EKODI_AI_DISCOVERY.canonical_origin,'https://ekodi.kr');
  assert.deepEqual([...EKODI_AI_DISCOVERY.aliases],['EKODI','에코디']);
  assert.equal(EKODI_AI_DISCOVERY.ai.mcp,'https://ekodi.kr/mcp');
  assert.equal(EKODI_AI_DISCOVERY.ai.mcp_protocol_version,'2026-07-28');
  assert.equal(EKODI_AI_DISCOVERY.ai.clients.genspark.integration,'custom-mcp');
  assert.equal(EKODI_AI_DISCOVERY.ai.clients.genspark.endpoint,'https://ekodi.kr/mcp');
  assert.equal(EKODI_AI_DISCOVERY.ai.clients.genspark.execution_authority,'ekodi-orchestrator');
  assert.equal(EKODI_AI_DISCOVERY.security.orchestrator_is_execution_authority,true);
  assert.equal(EKODI_AI_DISCOVERY.security.external_ai_is_execution_authority,false);
  assert.equal(EKODI_AI_DISCOVERY.discovery.name_recognition_is_authorization,false);
});

test('MCP exposes discovery, account and authoritative task lifecycle tools',()=>{
  for(const name of ['identify_ekodi','discover_public_services','account_status','submit_task','get_task_status','approve_task','cancel_task','ekodi_delegate_command'])assert.ok(tool(name),`missing ${name}`);
  assert.equal(tool('identify_ekodi').securitySchemes[0].type,'noauth');
  assert.equal(tool('discover_public_services').securitySchemes[0].type,'noauth');
  assert.equal(tool('submit_task').securitySchemes[0].type,'oauth2');
  assert.equal(tool('get_task_status').securitySchemes[0].type,'oauth2');
  assert.equal(tool('approve_task').securitySchemes[0].type,'oauth2');
  assert.equal(tool('approve_task').annotations.destructiveHint,true);
  assert.deepEqual(tool('approve_task').inputSchema.required,['taskId','expectedStateVersion']);
  assert.equal(tool('cancel_task').annotations.destructiveHint,true);
});

test('public identity tool resolves EKODI without granting authorization',async()=>{
  const result=await callEkodiMcpTool('identify_ekodi',{},new Request('https://ekodi.kr/mcp',{method:'POST'}),{});
  assert.equal(result.structuredContent.canonicalOrigin,'https://ekodi.kr');
  assert.deepEqual(result.structuredContent.aliases,['EKODI','에코디']);
  assert.equal(result.structuredContent.recognitionIsAuthorization,false);
  assert.equal(result.structuredContent.orchestratorIsExecutionAuthority,true);
});

const MODERN_META={
  'io.modelcontextprotocol/protocolVersion':'2026-07-28',
  'io.modelcontextprotocol/clientInfo':{name:'ekodi-contract-test',version:'1.0.0'},
  'io.modelcontextprotocol/clientCapabilities':{},
};

test('modern MCP responses carry required resultType while legacy responses stay compatible',async()=>{
  const modernList=new Request('https://ekodi.kr/mcp',{method:'POST',headers:{'content-type':'application/json','MCP-Protocol-Version':'2026-07-28'},body:JSON.stringify({
    jsonrpc:'2.0',id:41,method:'tools/list',params:{_meta:MODERN_META},
  })});
  const modernListBody=await (await handleEkodiMcpGateway(modernList,{})).json();
  assert.equal(modernListBody.result.resultType,'complete');
  assert.equal(modernListBody.result.ttlMs,300000);
  assert.equal(modernListBody.result.cacheScope,'public');
  assert.ok(modernListBody.result.tools.some(item=>item.name==='submit_task'));

  const modernInit=new Request('https://ekodi.kr/mcp',{method:'POST',headers:{'content-type':'application/json','MCP-Protocol-Version':'2026-07-28'},body:JSON.stringify({
    jsonrpc:'2.0',id:42,method:'initialize',params:{_meta:MODERN_META},
  })});
  const modernInitBody=await (await handleEkodiMcpGateway(modernInit,{})).json();
  assert.equal(modernInitBody.result.resultType,'complete');
  assert.equal(modernInitBody.result.protocolVersion,'2026-07-28');

  const legacyList=new Request('https://ekodi.kr/mcp',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
    jsonrpc:'2.0',id:43,method:'tools/list',params:{},
  })});
  const legacyListBody=await (await handleEkodiMcpGateway(legacyList,{})).json();
  assert.equal(Object.hasOwn(legacyListBody.result,'resultType'),false);
});

test('modern OAuth challenge is a complete MCP result with wire-level 401',async()=>{
  const request=new Request('https://ekodi.kr/mcp',{method:'POST',headers:{'content-type':'application/json','MCP-Protocol-Version':'2026-07-28'},body:JSON.stringify({
    jsonrpc:'2.0',id:44,method:'tools/call',params:{name:'submit_task',arguments:{intent:'must not execute'},_meta:MODERN_META},
  })});
  const response=await handleEkodiMcpGateway(request,{});
  assert.equal(response.status,401);
  assert.match(response.headers.get('www-authenticate')||'',/resource_metadata="https:\/\/ekodi\.kr\/\.well-known\/oauth-protected-resource"/);
  const body=await response.json();
  assert.equal(body.result.resultType,'complete');
  assert.equal(body.result.structuredContent.authenticated,false);
  assert.match(body.result._meta['mcp/www_authenticate'][0],/oauth-protected-resource/);
});

test('unauthenticated task submission gets HTTP 401 OAuth challenge and never reaches DB',async()=>{
  const request=new Request('https://ekodi.kr/mcp',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:7,method:'tools/call',params:{name:'submit_task',arguments:{intent:'must not execute'}}})});
  const response=await handleEkodiMcpGateway(request,{});
  assert.equal(response.status,401);
  assert.match(response.headers.get('www-authenticate')||'',/error="missing_token"/);
  const body=await response.json();
  assert.equal(body.result.structuredContent.authenticated,false);
  assert.match(body.result._meta['mcp/www_authenticate'][0],/oauth-protected-resource/);
});

test('orchestrator task adapter is requester-isolated and queues through the existing command plane',async()=>{
  const source=await readFile(new URL('../ekodi-orchestrator-task-adapter.js',import.meta.url),'utf8');
  assert.match(source,/ekodi_orchestrator_tasks/);
  assert.match(source,/requester_id = \?/);
  assert.match(source,/ingestEkodiPulse/);
  assert.match(source,/ekodi-command-plane/);
  assert.match(source,/state='cancelled'/);
  assert.match(source,/state IN \('queued','retry'\)/);
});


test('MCP delegated tasks carry standing delegation, expose retries, and synchronize after immediate dispatch',async()=>{
  const source=await readFile(new URL('../ekodi-orchestrator-task-adapter.js',import.meta.url),'utf8');
  assert.match(source,/delegation:\{allowed:true,reversible:true,audited:true,preflightVerified:true,verificationDefined:true\}/);
  assert.match(source,/runEkodiCommandQueue\(env,\{limit:1,taskId:id\}\)/);
  assert.match(source,/assigned_worker='ekodi-command-plane'/);
  assert.match(source,/if\(value==='retry'\)return'assigned'/);
  assert.match(source,/commandLedger:commandMeta/);
  assert.doesNotMatch(source,/return'retrying'/);
  assert.match(source,/commandState:commandMeta\?\.state\|\|null/);
  assert.match(source,/humanGate/);
  assert.match(source,/approvalTool:'approve_task'/);
  assert.match(source,/expectedStateVersion:stateVersion/);
  assert.match(source,/attemptCount:Number\(commandMeta\?\.attemptCount\|\|0\)/);
  assert.match(source,/lastError:commandMeta\?\.lastError\|\|''/);
  assert.match(source,/state_version=state_version\+\?/);
  assert.match(source,/syncFromCommandLedger\(db,env,await ownedTask\(db,id,requester\)\)/);
  const assign=source.indexOf("SET state='assigned'");
  const dispatch=source.indexOf('await runEkodiCommandQueue(env,{limit:1,taskId:id})');
  assert.ok(assign>=0&&dispatch>assign,'assignment must be recorded before inline dispatch so execution state is not overwritten back to assigned');
});


test('orchestrator propagates canonical identity into least-privilege execution authority',async()=>{
  const source=await readFile(new URL('../ekodi-orchestrator-task-adapter.js',import.meta.url),'utf8');
  assert.match(source,/async function resolveCommandAuthority\(db,identity=\{\},target=\{\}\)/);
  assert.match(source,/identity\?\.personId/);
  assert.match(source,/customer_access_grants/);
  assert.match(source,/accessGrantIsActive\(grant\)/);
  assert.match(source,/tenantAdminCapabilitiesForRole\(grant\.role\)/);
  assert.match(source,/denied_capabilities_json/);
  assert.match(source,/context:\{source:'mcp'.*authority\}/s);
  assert.match(source,/platformRole==='super_admin'/);
});


test('human-gate approval is super-admin-only, version-bound and auditable',async()=>{
  const source=await readFile(new URL('../ekodi-orchestrator-task-adapter.js',import.meta.url),'utf8');
  assert.match(source,/export async function approveOrchestratorTask/);
  assert.match(source,/authority\?\.role!=='super_admin'/);
  assert.match(source,/expected_state_version_required/);
  assert.match(source,/state_version\|\|0\)!==expectedStateVersion/);
  assert.match(source,/row\.state!=='blocked'/);
  assert.match(source,/command\?\.state,40\).*human_gate/s);
  assert.match(source,/human_gate_approval_recorded/);
  assert.match(source,/human_gate_approval_applied/);
  assert.match(source,/SET state='assigned',state_version=state_version\+1/);
  assert.match(source,/SET state='queued',context_json=\?/);
  assert.match(source,/humanApproval:receipt/);
  assert.match(source,/runEkodiCommandQueue\(env,\{limit:1,taskId:task\}\)/);
});
