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
  assert.equal(EKODI_AI_DISCOVERY.security.orchestrator_is_execution_authority,true);
  assert.equal(EKODI_AI_DISCOVERY.security.external_ai_is_execution_authority,false);
  assert.equal(EKODI_AI_DISCOVERY.discovery.name_recognition_is_authorization,false);
});

test('MCP exposes discovery, account and authoritative task lifecycle tools',()=>{
  for(const name of ['identify_ekodi','discover_public_services','account_status','submit_task','get_task_status','cancel_task','ekodi_delegate_command'])assert.ok(tool(name),`missing ${name}`);
  assert.equal(tool('identify_ekodi').securitySchemes[0].type,'noauth');
  assert.equal(tool('discover_public_services').securitySchemes[0].type,'noauth');
  assert.equal(tool('submit_task').securitySchemes[0].type,'oauth2');
  assert.equal(tool('get_task_status').securitySchemes[0].type,'oauth2');
  assert.equal(tool('cancel_task').annotations.destructiveHint,true);
});

test('public identity tool resolves EKODI without granting authorization',async()=>{
  const result=await callEkodiMcpTool('identify_ekodi',{},new Request('https://ekodi.kr/mcp',{method:'POST'}),{});
  assert.equal(result.structuredContent.canonicalOrigin,'https://ekodi.kr');
  assert.deepEqual(result.structuredContent.aliases,['EKODI','에코디']);
  assert.equal(result.structuredContent.recognitionIsAuthorization,false);
  assert.equal(result.structuredContent.orchestratorIsExecutionAuthority,true);
});

test('unauthenticated task submission gets an OAuth challenge and never reaches DB',async()=>{
  const request=new Request('https://ekodi.kr/mcp',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:7,method:'tools/call',params:{name:'submit_task',arguments:{intent:'must not execute'}}})});
  const response=await handleEkodiMcpGateway(request,{});
  assert.equal(response.status,200);
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
