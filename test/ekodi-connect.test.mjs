import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EKODI_CONNECT_CLIENT_CLASSES, PRIVILEGED_MCP_TOOLS, assessConnectorReadiness, authorizationServerMetadataUrls,
  connectClientClass, filterToolsForClient, isClientClassBound, isToolExposedToClient, parseClientClassMap, probeConnectorReadiness, resolveConnectClientClass,
} from '../ekodi-connect.js';
import { EKODI_MCP_CLIENT_POLICY } from '../mcp-client-policy.js';
import { EKODI_MCP_RESOURCE, EKODI_MCP_TOOLS, callEkodiMcpTool, handleEkodiMcpGateway, mcpProtectedResourceMetadata } from '../ekodi-mcp-gateway.js';

const CLAUDE_ID='11111111-2222-4333-8444-555555555555';
const CHATGPT_ID='33333333-3333-4333-8333-333333333333';
const ENV={EKODI_MCP_CLIENT_CLASS_MAP:JSON.stringify({[CLAUDE_ID]:'claude-hosted',[CHATGPT_ID]:'chatgpt'})};
function tokenFor(claims){
  const part=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${part({alg:'RS256',typ:'JWT'})}.${part(claims)}.signature`;
}
const fetchImpl=async url=>{
  const value=String(url);
  if(value.endsWith('/auth/v1/user'))return new Response(JSON.stringify({id:'user-1',email:'u@example.com'}),{status:200});
  if(value.includes('/rest/v1/rpc/current_ekodi_mcp_identity'))return new Response(JSON.stringify({person_id:'person-1',ekodi_id:'EKODI-1',login_provider:'google',canonical:true,authorized:true}),{status:200});
  return new Response('{}',{status:404});
};
const rpc=(body,token)=>new Request('https://ekodi.kr/mcp',{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});

test('Claude client classes are registered once and surfaced through the public client policy',()=>{
  const hosted=connectClientClass('claude-hosted');
  assert.equal(hosted.provider,'anthropic');
  assert.deepEqual([...hosted.redirectUris],['https://claude.ai/api/mcp/auth_callback']);
  assert.equal(hosted.registration,'pre-registered');
  assert.equal(connectClientClass('claude-code').status,'planned');
  const ids=EKODI_MCP_CLIENT_POLICY.clientClasses.map(c=>c.id);
  for(const c of EKODI_CONNECT_CLIENT_CLASSES)assert.ok(ids.includes(c.id),c.id);
  assert.equal(EKODI_MCP_CLIENT_POLICY.onboarding.dynamicRegistrationDefault,false);
  assert.ok(!JSON.stringify(EKODI_MCP_CLIENT_POLICY).includes('redirectUris'));
});

test('client id binding accepts only UUID → known class and defaults to least privilege',()=>{
  const map=parseClientClassMap({[CLAUDE_ID.toUpperCase()]:'claude-hosted','not-a-uuid':'claude-hosted','22222222-2222-4222-8222-222222222222':'root'});
  assert.deepEqual(Object.keys(map),[CLAUDE_ID]);
  assert.equal(parseClientClassMap('{bad json').constructor,Object);
  assert.equal(resolveConnectClientClass(CLAUDE_ID,ENV),'claude-hosted');
  assert.equal(resolveConnectClientClass('other',ENV),'unregistered-mcp-oauth');
  assert.equal(resolveConnectClientClass('',{}),'unregistered-mcp-oauth');
  assert.equal(isToolExposedToClient('approve_task',resolveConnectClientClass('44444444-4444-4444-8444-444444444444',ENV)),false);
  assert.equal(isToolExposedToClient('approve_task','no-such-class'),false);
});

test('external assistants never see or call privileged Human Gate tools; legacy classes unchanged',()=>{
  assert.deepEqual([...PRIVILEGED_MCP_TOOLS],['approve_task']);
  assert.equal(isToolExposedToClient('approve_task','claude-hosted'),false);
  assert.equal(isToolExposedToClient('submit_task','claude-hosted'),true);
  assert.equal(isToolExposedToClient('approve_task','chatgpt'),true);
  assert.equal(isToolExposedToClient('approve_task','generic-mcp-oauth'),true);
  const names=filterToolsForClient(EKODI_MCP_TOOLS,'claude-hosted').map(t=>t.name);
  assert.ok(!names.includes('approve_task'));
  assert.equal(names.length,EKODI_MCP_TOOLS.length-1);
});

test('gateway tools/list: anonymous full catalog, Claude and unbound clients filtered, bound ChatGPT full',async()=>{
  const anon=await (await handleEkodiMcpGateway(rpc({jsonrpc:'2.0',id:1,method:'tools/list'}),ENV,{fetchImpl})).json();
  assert.ok(anon.result.tools.some(t=>t.name==='approve_task'));
  const claude=tokenFor({sub:'user-1',client_id:CLAUDE_ID,aud:EKODI_MCP_RESOURCE});
  const filtered=await (await handleEkodiMcpGateway(rpc({jsonrpc:'2.0',id:2,method:'tools/list'},claude),ENV,{fetchImpl})).json();
  assert.ok(!filtered.result.tools.some(t=>t.name==='approve_task'));
  assert.ok(filtered.result.tools.some(t=>t.name==='submit_task'));
  assert.equal(filtered.result.cacheScope,'private');
  const chatgpt=tokenFor({sub:'user-1',client_id:CHATGPT_ID,aud:EKODI_MCP_RESOURCE});
  const full=await (await handleEkodiMcpGateway(rpc({jsonrpc:'2.0',id:3,method:'tools/list'},chatgpt),ENV,{fetchImpl})).json();
  assert.ok(full.result.tools.some(t=>t.name==='approve_task'));
  const unbound=tokenFor({sub:'user-1',client_id:'55555555-5555-4555-8555-555555555555',aud:EKODI_MCP_RESOURCE});
  const least=await (await handleEkodiMcpGateway(rpc({jsonrpc:'2.0',id:4,method:'tools/list'},unbound),ENV,{fetchImpl})).json();
  assert.ok(!least.result.tools.some(t=>t.name==='approve_task'));
});

test('gateway tools/call refuses approve_task for Claude before any orchestrator side effect',async()=>{
  const token=tokenFor({sub:'user-1',client_id:CLAUDE_ID,aud:EKODI_MCP_RESOURCE});
  const request=new Request('https://ekodi.kr/mcp',{headers:{authorization:`Bearer ${token}`}});
  const result=await callEkodiMcpTool('approve_task',{taskId:'t1',expectedStateVersion:1},request,ENV,{fetchImpl});
  assert.equal(result.structuredContent.error,'TOOL_NOT_EXPOSED_FOR_CLIENT');
  assert.equal(result.structuredContent.clientClass,'claude-hosted');
});

test('readiness: live gateway contract passes critical checks with pre-registered Claude client',async()=>{
  const unauth=await handleEkodiMcpGateway(rpc({jsonrpc:'2.0',id:9,method:'tools/call',params:{name:'submit_task',arguments:{intent:'x'}}}),{},{fetchImpl:async()=>new Response('{}',{status:401})});
  const report=assessConnectorReadiness({
    unauthStatus:unauth.status,challengeHeader:unauth.headers.get('www-authenticate'),
    resourceMetadata:mcpProtectedResourceMetadata(),
    authServerMetadata:{issuer:'x',authorization_endpoint:'a',token_endpoint:'t',code_challenge_methods_supported:['S256'],grant_types_supported:['authorization_code','refresh_token']},
    clientBound:true,
  });
  assert.equal(report.ready,true,JSON.stringify(report.checks));
  assert.equal(report.fullyReady,true);
});

test('readiness: missing challenge or resource mismatch is critical; missing S256 is advisory',()=>{
  const bad=assessConnectorReadiness({unauthStatus:200,challengeHeader:'',resourceMetadata:{resource:'https://ekodi.kr/mcp/',authorization_servers:[]},authServerMetadata:null});
  assert.equal(bad.ready,false);
  const advisory=assessConnectorReadiness({unauthStatus:401,challengeHeader:'Bearer resource_metadata="https://ekodi.kr/.well-known/oauth-protected-resource"',
    resourceMetadata:{resource:'https://ekodi.kr/mcp',authorization_servers:['https://x.supabase.co/auth/v1']},
    authServerMetadata:{authorization_endpoint:'a',token_endpoint:'t'}});
  assert.equal(advisory.ready,true);
  assert.equal(advisory.fullyReady,false);
  assert.equal(advisory.checks.find(c=>c.id==='pkce_s256_advertised').ok,false);
});

test('RFC 8414 metadata URL candidates for a path issuer',()=>{
  const urls=authorizationServerMetadataUrls('https://x.supabase.co/auth/v1');
  assert.equal(urls[0],'https://x.supabase.co/.well-known/oauth-authorization-server/auth/v1');
  assert.ok(urls.includes('https://x.supabase.co/auth/v1/.well-known/openid-configuration'));
  assert.deepEqual(authorizationServerMetadataUrls('not a url'),[]);
});

test('probe follows challenge → resource metadata → authorization server metadata',async()=>{
  const seen=[];
  const fake=async(url,init)=>{
    seen.push(String(url));
    if(String(url)==='https://ekodi.kr/mcp')return new Response('{}',{status:401,headers:{'www-authenticate':'Bearer resource_metadata="https://ekodi.kr/.well-known/oauth-protected-resource"'}});
    if(String(url).endsWith('/oauth-protected-resource'))return Response.json(mcpProtectedResourceMetadata());
    if(String(url).includes('/.well-known/oauth-authorization-server/auth/v1'))return Response.json({issuer:'i',authorization_endpoint:'a',token_endpoint:'t',code_challenge_methods_supported:['S256']});
    return new Response('',{status:404});
  };
  const report=await probeConnectorReadiness({fetchImpl:fake});
  assert.equal(report.ready,true);
  assert.equal(seen.length,3);
});

test('tools/list with an invalid or expired token never returns privileged tools',async()=>{
  const badFetch=async()=>new Response('{}',{status:401});
  const expired=tokenFor({sub:'user-1',client_id:CHATGPT_ID,aud:EKODI_MCP_RESOURCE});
  const res=await (await handleEkodiMcpGateway(rpc({jsonrpc:'2.0',id:7,method:'tools/list'},expired),ENV,{fetchImpl:badFetch})).json();
  assert.ok(!res.result.tools.some(t=>t.name==='approve_task'));
  assert.equal(res.result.cacheScope,'private');
});

test('batched tools/call cannot smuggle approve_task for Claude',async()=>{
  const token=tokenFor({sub:'user-1',client_id:CLAUDE_ID,aud:EKODI_MCP_RESOURCE});
  const call=(id,name)=>({jsonrpc:'2.0',id,method:'tools/call',params:{name,arguments:{taskId:'t1',expectedStateVersion:1}}});
  const out=await (await handleEkodiMcpGateway(rpc([call(1,'get_task_status'),call(2,'approve_task'),call(3,'APPROVE_TASK')],token),ENV,{fetchImpl})).json();
  const byId=new Map(out.map(item=>[item.id,item]));
  assert.equal(byId.get(2).result.structuredContent.error,'TOOL_NOT_EXPOSED_FOR_CLIENT');
  assert.notEqual(byId.get(3).result.structuredContent?.approved,true);
});

test('client identification is only claimed when the pre-registered class is actually bound',()=>{
  const base={unauthStatus:401,challengeHeader:'Bearer resource_metadata="x"',resourceMetadata:{resource:'https://ekodi.kr/mcp',authorization_servers:['https://i']},authServerMetadata:{authorization_endpoint:'a',token_endpoint:'t'}};
  assert.equal(assessConnectorReadiness(base).checks.find(c=>c.id==='client_identification').ok,false);
  assert.equal(assessConnectorReadiness({...base,clientBound:true}).checks.find(c=>c.id==='client_identification').ok,true);
  assert.equal(assessConnectorReadiness({...base,authServerMetadata:{...base.authServerMetadata,registration_endpoint:'r'}}).checks.find(c=>c.id==='client_identification').ok,true);
  assert.equal(assessConnectorReadiness(base).checks.find(c=>c.id==='refresh_supported').ok,false);
  assert.equal(isClientClassBound('chatgpt',ENV),true);
  assert.equal(isClientClassBound('claude-code',ENV),false);
});
