import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EKODI_MCP_RESOURCE,
  EKODI_MCP_TOOLS,
  callEkodiMcpTool,
  handleEkodiMcpGateway,
  mcpProtectedResourceMetadata,
  validateMcpBearer,
} from '../ekodi-mcp-gateway.js';

function tokenFor(claims){
  const part=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${part({alg:'RS256',typ:'JWT'})}.${part(claims)}.signature`;
}

test('protected resource metadata points MCP at EKODI Supabase OAuth',()=>{
  const metadata=mcpProtectedResourceMetadata();
  assert.equal(metadata.resource,EKODI_MCP_RESOURCE);
  assert.match(metadata.authorization_servers[0],/supabase\.co\/auth\/v1$/);
  assert.deepEqual(metadata.scopes_supported,['openid','email','profile']);
});

test('MCP tool surface is read-only and personal tools declare OAuth',()=>{
  assert.ok(EKODI_MCP_TOOLS.length>=4);
  for(const tool of EKODI_MCP_TOOLS) assert.equal(tool.annotations.readOnlyHint,true);
  assert.equal(EKODI_MCP_TOOLS.find(tool=>tool.name==='ekodi_bridge_status').securitySchemes[0].type,'noauth');
  assert.equal(EKODI_MCP_TOOLS.find(tool=>tool.name==='ekodi_my_identity').securitySchemes[0].type,'oauth2');
});
test('MCP bearer validation rejects direct sessions and wrong audience',async()=>{
  const fetchImpl=async()=>new Response(JSON.stringify({id:'user-1',email:'u@example.com'}),{status:200});
  const direct=tokenFor({sub:'user-1',aud:EKODI_MCP_RESOURCE});
  const wrongAud=tokenFor({sub:'user-1',client_id:'client-1',aud:'authenticated'});
  let result=await validateMcpBearer(new Request('https://api.ekodi.kr/mcp',{headers:{authorization:`Bearer ${direct}`}}),{fetchImpl});
  assert.equal(result.reason,'oauth_client_required');
  result=await validateMcpBearer(new Request('https://api.ekodi.kr/mcp',{headers:{authorization:`Bearer ${wrongAud}`}}),{fetchImpl});
  assert.equal(result.reason,'invalid_audience');
});

test('MCP bearer validation accepts an OAuth token minted for EKODI MCP',async()=>{
  const token=tokenFor({sub:'user-1',client_id:'client-1',aud:EKODI_MCP_RESOURCE});
  const fetchImpl=async()=>new Response(JSON.stringify({id:'user-1',email:'u@example.com'}),{status:200});
  const result=await validateMcpBearer(new Request('https://api.ekodi.kr/mcp',{headers:{authorization:`Bearer ${token}`}}),{fetchImpl});
  assert.equal(result.ok,true);
  assert.equal(result.claims.client_id,'client-1');
});

test('authenticated tool advertises OAuth challenge when connection is missing',async()=>{
  const result=await callEkodiMcpTool('ekodi_my_identity',{},new Request('https://api.ekodi.kr/mcp'),{});
  assert.equal(result.structuredContent.authenticated,false);
  assert.match(result._meta['mcp/www_authenticate'][0],/oauth-protected-resource/);
});
test('stateless MCP 2026-07-28 discovers and lists Fabric-backed tools',async()=>{
  const discover=new Request('https://api.ekodi.kr/mcp',{method:'POST',headers:{'content-type':'application/json','MCP-Protocol-Version':'2026-07-28','Mcp-Method':'server/discover'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'server/discover',params:{_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28'}}})});
  const discovered=await handleEkodiMcpGateway(discover,{});
  const discoverBody=await discovered.json();
  assert.deepEqual(discoverBody.result.supportedVersions,['2026-07-28']);
  assert.equal(discoverBody.result.cacheScope,'public');
  assert.equal(discoverBody.result._meta['io.modelcontextprotocol/serverInfo'].name,'ekodi-sovereign-capability-fabric');

  const list=new Request('https://api.ekodi.kr/mcp',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/list',params:{}})});
  const listed=await handleEkodiMcpGateway(list,{});
  const listBody=await listed.json();
  assert.equal(listBody.result.cacheScope,'public');
  assert.ok(listBody.result.tools.some(tool=>tool.name==='ekodi_my_services'));
  assert.ok(listBody.result.tools.filter(tool=>tool.securitySchemes[0].type==='oauth2').every(tool=>tool.ekodiCapability));
  assert.ok(listBody.result.tools.every(tool=>!JSON.stringify(tool).includes('apiKey')));
});
