import test from 'node:test';
import assert from 'node:assert/strict';
import { createGensparkProvider, getGensparkProviderStatus } from '../genspark-provider-adapter.js';

test('Genspark Agent Fabric adapter is disabled unless explicitly enabled and configured',()=>{
  const provider=createGensparkProvider({});
  assert.equal(provider.id,'genspark');
  assert.equal(provider.available,false);
  assert.equal(provider.automationAllowed,false);
  assert.equal(provider.officialPath,false);
  assert.ok(provider.capabilities.includes('research'));
  assert.ok(provider.capabilities.includes('browser'));
});

test('Genspark Agent Fabric adapter uses a configured relay without transferring EKODI authority',async()=>{
  let request=null;
  const provider=createGensparkProvider({
    EKODI_PROVIDER_GENSPARK_ENABLED:'true',
    GENSPARK_AGENT_ENDPOINT:'https://genspark-relay.example.test/invoke',
    GENSPARK_AGENT_TOKEN:'secret-token',
  },{
    fetchImpl:async(url,init)=>{
      request={url,init,body:JSON.parse(init.body)};
      return new Response(JSON.stringify({id:'gs-1',text:'research result'}),{status:200,headers:{'content-type':'application/json'}});
    },
  });
  assert.equal(provider.available,true);
  const result=await provider.invoke({taskName:'research.test',context:{message:'public research request'}});
  assert.equal(request.url,'https://genspark-relay.example.test/invoke');
  assert.equal(request.init.headers.authorization,'Bearer secret-token');
  assert.equal(request.body.authority.ekodiOrchestratorFinal,true);
  assert.equal(request.body.authority.authorityTransfer,false);
  assert.equal(request.body.authority.sideEffectsAuthorized,false);
  assert.equal(result.text,'research result');
  assert.equal(result.authorityTransferred,false);
});

test('Genspark status advertises inbound EKODI MCP without claiming an official direct API',()=>{
  const status=getGensparkProviderStatus({});
  assert.equal(status.inboundMcp,'https://ekodi.kr/mcp');
  assert.equal(status.officialDirectApi,false);
  assert.equal(status.available,false);
});
