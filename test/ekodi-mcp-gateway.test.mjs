import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  EKODI_MCP_RESOURCE,
  EKODI_MCP_LEGACY_RESOURCES,
  EKODI_MCP_TOOLS,
  MCP_SERVER_INSTRUCTIONS,
  callEkodiMcpTool,
  handleEkodiMcpGateway,
  mcpProtectedResourceMetadata,
  validateMcpBearer,
} from '../ekodi-mcp-gateway.js';

function tokenFor(claims){
  const part=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${part({alg:'RS256',typ:'JWT'})}.${part(claims)}.signature`;
}
function tool(name){return EKODI_MCP_TOOLS.find(item=>item.name===name)}

const gatewaySource = await readFile(new URL('../ekodi-mcp-gateway.js', import.meta.url), 'utf8');

test('MCP personal status and membership use only canonical apex API routes',()=>{
  assert.match(gatewaySource,/https:\/\/ekodi\.kr\/api\/user-ai\/status/);
  assert.match(gatewaySource,/https:\/\/ekodi\.kr\/api\/membership\/portfolio/);
  assert.doesNotMatch(gatewaySource,/https:\/\/api\.ekodi\.kr/);
  assert.doesNotMatch(gatewaySource,/https:\/\/ekodi\.kr\/api\/api\//);
});

test('protected resource metadata points MCP at EKODI Supabase OAuth',()=>{
  const metadata=mcpProtectedResourceMetadata();
  assert.equal(metadata.resource,EKODI_MCP_RESOURCE);
  assert.equal(metadata.resource_name,'EKODI MCP Gateway');
  assert.match(metadata.authorization_servers[0],/supabase\.co\/auth\/v1$/);
  assert.deepEqual(metadata.scopes_supported,['openid','email','profile']);
});

test('MCP tool surface keeps reads safe and exposes bounded authenticated mutations',()=>{
  assert.ok(EKODI_MCP_TOOLS.length>=11);
  for(const name of ['identify_ekodi','discover_public_services','ekodi_bridge_status','account_status','get_task_status','ekodi_my_identity','ekodi_my_ai_status','ekodi_my_services']){
    assert.equal(tool(name)?.annotations?.readOnlyHint,true,`${name} must remain read-only`);
    assert.equal(tool(name)?.annotations?.destructiveHint,false,`${name} must remain non-destructive`);
  }
  assert.equal(tool('identify_ekodi').securitySchemes[0].type,'noauth');
  assert.equal(tool('discover_public_services').securitySchemes[0].type,'noauth');
  assert.equal(tool('ekodi_bridge_status').securitySchemes[0].type,'noauth');
  assert.equal(tool('account_status').securitySchemes[0].type,'oauth2');
  assert.equal(tool('account_status').ekodiCapability,'identity.self.read');
  assert.equal(tool('ekodi_my_identity').securitySchemes[0].type,'oauth2');

  const submit=tool('submit_task');
  assert.equal(submit.securitySchemes[0].type,'oauth2');
  assert.equal(submit.ekodiCapability,'ai.command.delegate');
  assert.equal(submit.annotations.readOnlyHint,false);
  assert.equal(submit.annotations.destructiveHint,false);
  assert.deepEqual(submit.inputSchema.required,['intent']);
  assert.equal(submit.inputSchema.properties.deploymentRequested.type,'boolean');
  assert.equal(submit.inputSchema.properties.deploymentRequested.default,false);
  assert.equal(submit.inputSchema.properties.agent.maxLength,32);
  assert.match(submit.description,/only authorized branchRef/);

  const status=tool('get_task_status');
  assert.equal(status.securitySchemes[0].type,'oauth2');
  assert.equal(status.ekodiCapability,'ai.command.delegate');
  assert.deepEqual(status.inputSchema.required,['taskId']);

  const cancel=tool('cancel_task');
  assert.equal(cancel.securitySchemes[0].type,'oauth2');
  assert.equal(cancel.ekodiCapability,'ai.command.delegate');
  assert.equal(cancel.annotations.readOnlyHint,false);
  assert.equal(cancel.annotations.destructiveHint,true);
  assert.deepEqual(cancel.inputSchema.required,['taskId']);

  const command=tool('ekodi_delegate_command');
  assert.equal(command.securitySchemes[0].type,'oauth2');
  assert.equal(command.ekodiCapability,'ai.command.delegate');
  assert.equal(command.annotations.readOnlyHint,false);
  assert.equal(command.annotations.destructiveHint,false);
  assert.equal(command.inputSchema.required[0],'goal');
});
test('MCP bearer validation rejects direct sessions and unconsented OAuth fallback',async()=>{
  const fetchImpl=async()=>new Response(JSON.stringify({id:'user-1',email:'u@example.com'}),{status:200});
  const direct=tokenFor({sub:'user-1',aud:EKODI_MCP_RESOURCE});
  const wrongAud=tokenFor({sub:'user-1',client_id:'client-1',aud:'authenticated'});
  let result=await validateMcpBearer(new Request('https://ekodi.kr/mcp',{headers:{authorization:`Bearer ${direct}`}}),{fetchImpl});
  assert.equal(result.reason,'oauth_client_required');
  result=await validateMcpBearer(new Request('https://ekodi.kr/mcp',{headers:{authorization:`Bearer ${wrongAud}`}}),{fetchImpl});
  assert.equal(result.reason,'insufficient_mcp_authorization');
});

test('MCP bearer validation accepts an OAuth token minted for EKODI MCP',async()=>{
  const token=tokenFor({sub:'user-1',client_id:'client-1',aud:EKODI_MCP_RESOURCE});
  const fetchImpl=async()=>new Response(JSON.stringify({id:'user-1',email:'u@example.com'}),{status:200});
  const result=await validateMcpBearer(new Request('https://ekodi.kr/mcp',{headers:{authorization:`Bearer ${token}`}}),{fetchImpl});
  assert.equal(result.ok,true);
  assert.equal(result.claims.client_id,'client-1');
  assert.equal(result.resourceAudience,EKODI_MCP_RESOURCE);
  assert.equal(result.legacyAudience,false);
  assert.equal(result.fallbackAuthorization,false);
});

test('MCP bearer validation accepts hosted OAuth token only after durable MCP consent verification',async()=>{
  const token=tokenFor({sub:'user-1',client_id:'client-1',aud:'authenticated'});
  const fetchImpl=async url=>{
    const value=String(url);
    if(value.endsWith('/auth/v1/user')) return new Response(JSON.stringify({id:'user-1',email:'u@example.com'}),{status:200});
    if(value.includes('/rest/v1/rpc/current_ekodi_mcp_identity')) return new Response(JSON.stringify({authenticated:true,authorized:true,canonical:true}),{status:200});
    return new Response('{}',{status:404});
  };
  const result=await validateMcpBearer(new Request('https://ekodi.kr/mcp',{headers:{authorization:`Bearer ${token}`}}),{fetchImpl});
  assert.equal(result.ok,true);
  assert.equal(result.resourceAudience,EKODI_MCP_RESOURCE);
  assert.equal(result.fallbackAuthorization,true);
});

test('canonical MCP responses advertise only the apex resource',async()=>{
  const canonical=await handleEkodiMcpGateway(new Request('https://ekodi.kr/mcp',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:7,method:'ping'})}),{});
  assert.equal(canonical.headers.get('x-ekodi-mcp-resource'),EKODI_MCP_RESOURCE);
  assert.match(canonical.headers.get('link')||'',/rel="canonical"/);
  assert.equal(canonical.headers.get('x-ekodi-mcp-legacy-endpoint'),null);
});

test('protected tools use HTTP 401 challenge while public tools remain callable without OAuth',async()=>{
  const protectedRequest=new Request('https://ekodi.kr/mcp',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:71,method:'tools/call',params:{name:'account_status',arguments:{}}})});
  const protectedResponse=await handleEkodiMcpGateway(protectedRequest,{});
  assert.equal(protectedResponse.status,401);
  assert.match(protectedResponse.headers.get('www-authenticate')||'',/oauth-protected-resource/);

  const publicRequest=new Request('https://ekodi.kr/mcp',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:72,method:'tools/call',params:{name:'identify_ekodi',arguments:{}}})});
  const publicResponse=await handleEkodiMcpGateway(publicRequest,{});
  assert.equal(publicResponse.status,200);
  const publicBody=await publicResponse.json();
  assert.equal(publicBody.result.structuredContent.canonicalOrigin,'https://ekodi.kr');
});

test('authenticated tool advertises OAuth challenge when connection is missing',async()=>{
  const result=await callEkodiMcpTool('ekodi_my_identity',{},new Request('https://ekodi.kr/mcp'),{});
  assert.equal(result.structuredContent.authenticated,false);
  assert.match(result._meta['mcp/www_authenticate'][0],/oauth-protected-resource/);
});

test('authenticated MCP command delegates collaboration to EKODI without transferring execution authority',async()=>{
  const token=tokenFor({sub:'user-1',client_id:'chatgpt-client',aud:EKODI_MCP_RESOURCE});
  const fetchImpl=async url=>{
    const value=String(url);
    if(value.endsWith('/auth/v1/user')) return new Response(JSON.stringify({id:'user-1',email:'u@example.com'}),{status:200});
    if(value.includes('/rest/v1/rpc/current_ekodi_mcp_identity')) return new Response(JSON.stringify({person_id:'person-1',ekodi_id:'EKODI-1',login_provider:'google',canonical:true,authorized:true}),{status:200});
    return new Response('{}',{status:404});
  };
  let delegatedInput=null;
  const coreAiGateway={command:async input=>{
    delegatedInput=input;
    return {state:'verified',evidence:{providerDiversity:3,sentinelIndependent:true,verified:true}};
  }};
  const request=new Request('https://ekodi.kr/mcp',{headers:{authorization:`Bearer ${token}`}});
  const result=await callEkodiMcpTool('ekodi_delegate_command',{
    goal:'Coordinate a safe EKODI deployment review.',
    risk:'high',
    target:{workspaceSlug:'ekodibiz',service:'marketing',capability:'deploy.review',surface:'admin'},
  },request,{}, {fetchImpl,coreAiGateway});

  assert.equal(delegatedInput.goal,'Coordinate a safe EKODI deployment review.');
  assert.equal(delegatedInput.risk,'high');
  assert.equal(delegatedInput.context.source,'external-ai-mcp');
  assert.equal(delegatedInput.context.oauthClientId,'chatgpt-client');
  assert.equal(delegatedInput.context.authorityTransfer,false);
  assert.equal('personId' in delegatedInput.context,false);
  assert.equal('ekodiId' in delegatedInput.context,false);
  assert.equal(result.structuredContent.delegated,true);
  assert.equal(result.structuredContent.executor,'ekodi-v8');
  assert.equal(result.structuredContent.sideEffectsPerformed,false);
  assert.equal(result.structuredContent.authorityTransferred,false);
  assert.equal(result.structuredContent.externalExecutionAuthorized,false);
  assert.equal(result.structuredContent.humanGateRequiredForExternalExecution,true);
  assert.equal(result.structuredContent.collaboration.state,'verified');
});
test('stateless MCP 2026-07-28 discovers and lists Fabric-backed tools',async()=>{
  const discover=new Request('https://ekodi.kr/mcp',{method:'POST',headers:{'content-type':'application/json','MCP-Protocol-Version':'2026-07-28','Mcp-Method':'server/discover'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'server/discover',params:{_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28'}}})});
  const discovered=await handleEkodiMcpGateway(discover,{});
  const discoverBody=await discovered.json();
  assert.deepEqual(discoverBody.result.supportedVersions,['2026-07-28']);
  assert.equal(discoverBody.result.cacheScope,'public');
  assert.equal(discoverBody.result.resource,EKODI_MCP_RESOURCE);
  assert.equal(discoverBody.result.fabric.contract,'ekodi.sovereign-capability.v1');
  assert.equal(discoverBody.result._meta['io.modelcontextprotocol/serverInfo'].name,'ekodi-sovereign-capability-fabric');

  const list=new Request('https://ekodi.kr/mcp',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/list',params:{}})});
  const listed=await handleEkodiMcpGateway(list,{});
  const listBody=await listed.json();
  assert.equal(listBody.result.cacheScope,'public');
  assert.ok(listBody.result.tools.some(tool=>tool.name==='ekodi_my_services'));
  assert.ok(listBody.result.tools.some(tool=>tool.name==='submit_task'));
  assert.ok(listBody.result.tools.filter(tool=>tool.securitySchemes[0].type==='oauth2').every(tool=>tool.ekodiCapability));
  assert.ok(listBody.result.tools.every(tool=>!JSON.stringify(tool).includes('apiKey')));
});


test('MCP server instructions force every EKODI operation through the Orchestrator',async()=>{
  assert.match(MCP_SERVER_INSTRUCTIONS,/every request about EKODI systems/);
  assert.match(MCP_SERVER_INSTRUCTIONS,/sole execution authority/);
  assert.match(MCP_SERVER_INSTRUCTIONS,/call submit_task/);
  assert.match(MCP_SERVER_INSTRUCTIONS,/deploymentRequested=true/);
  assert.match(MCP_SERVER_INSTRUCTIONS,/returned branchRef exactly/);
  assert.match(MCP_SERVER_INSTRUCTIONS,/use get_task_status/);
  assert.match(MCP_SERVER_INSTRUCTIONS,/Never perform, simulate, or claim direct EKODI production changes/);

  const request=new Request('https://ekodi.kr/mcp',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:91,method:'server/discover',params:{}})});
  const response=await handleEkodiMcpGateway(request,{});
  const body=await response.json();
  assert.equal(body.result.instructions,MCP_SERVER_INSTRUCTIONS);
  assert.equal(body.result.alwaysRouteEkodiOperations,true);
  assert.equal(body.result.executionAuthority,'ekodi-orchestrator');
});
