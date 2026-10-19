import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchAnthropicMessages, resolveAnthropicWorkspace, resetAnthropicWorkspaceCache } from '../anthropic-workspace.js';

const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
const needsWorkspace=()=>json({type:'error',error:{type:'invalid_request_error',message:'This API key is not scoped to a workspace, so this request must include the anthropic-workspace-id header with the ID of the workspace to use.'}},400);

function fakeAnthropic({workspaces=[{id:'wrkspc_team'}],defaultId='wrkspc_default',lookupStatus=200}={}){
  const calls=[];
  const fetchImpl=async(url,init={})=>{
    url=String(url);calls.push({url,headers:{...(init.headers||{})}});
    if(url.includes('/v1/organizations/workspaces')){
      if(lookupStatus!==200)return json({type:'error',error:{type:'permission_error'}},lookupStatus);
      const list=url.includes('include_default=true')&&defaultId?[{id:defaultId},...workspaces]:workspaces;
      return json({data:list,has_more:false});
    }
    if(!init.headers?.['anthropic-workspace-id'])return needsWorkspace();
    return json({content:[{type:'text',text:'EKODI_PROVIDER_OK'}],model:'claude-test',usage:{input_tokens:1,output_tokens:1}});
  };
  return {calls,fetchImpl};
}

test('an identity-linked key gets the Default Workspace header once and it is reused',async()=>{
  resetAnthropicWorkspaceCache();
  const {calls,fetchImpl}=fakeAnthropic();
  const init={method:'POST',headers:{'x-api-key':'sk-ant-api-personal-1','content-type':'application/json'},body:'{}'};
  const first=await fetchAnthropicMessages({},'sk-ant-api-personal-1',init,fetchImpl);
  assert.equal(first.status,200);
  const retried=calls.filter(call=>call.url.endsWith('/v1/messages')).at(-1);
  assert.equal(retried.headers['anthropic-workspace-id'],'wrkspc_default','the Default Workspace is the one only include_default=true returns');
  calls.length=0;
  const second=await fetchAnthropicMessages({},'sk-ant-api-personal-1',init,fetchImpl);
  assert.equal(second.status,200);
  assert.equal(calls.length,1,'a cached workspace needs no second lookup or retry');
  assert.equal(calls[0].headers['anthropic-workspace-id'],'wrkspc_default');
});

test('a configured ANTHROPIC_WORKSPACE_ID wins and a workspace-scoped key sends no header',async()=>{
  resetAnthropicWorkspaceCache();
  const {calls,fetchImpl}=fakeAnthropic();
  await fetchAnthropicMessages({ANTHROPIC_WORKSPACE_ID:'wrkspc_pinned'},'sk-ant-api-personal-2',{headers:{}},fetchImpl);
  assert.equal(calls.length,1);
  assert.equal(calls[0].headers['anthropic-workspace-id'],'wrkspc_pinned');

  calls.length=0;
  const scoped=async(url,init)=>{calls.push({url:String(url),headers:{...init.headers}});return json({content:[{type:'text',text:'ok'}]})};
  const response=await fetchAnthropicMessages({},'sk-ant-api-workspace-key',{headers:{}},scoped);
  assert.equal(response.status,200);
  assert.equal(calls.length,1);
  assert.equal('anthropic-workspace-id' in calls[0].headers,false);
});

test('workspace lookup failures are explicit and never leak the key',async()=>{
  resetAnthropicWorkspaceCache();
  const denied=fakeAnthropic({lookupStatus:403});
  const error=await resolveAnthropicWorkspace({},'sk-ant-api-personal-3',{fetchImpl:denied.fetchImpl}).catch(e=>e);
  assert.match(error.message,/^anthropic_workspace_lookup_403$/);
  assert.equal(error.message.includes('sk-ant'),false);

  resetAnthropicWorkspaceCache();
  const ambiguous=fakeAnthropic({workspaces:[{id:'wrkspc_a'},{id:'wrkspc_b'}],defaultId:''});
  await assert.rejects(resolveAnthropicWorkspace({},'sk-ant-api-personal-4',{fetchImpl:ambiguous.fetchImpl}),/anthropic_workspace_ambiguous/);

  resetAnthropicWorkspaceCache();
  const single=fakeAnthropic({workspaces:[{id:'wrkspc_only'}],defaultId:''});
  assert.equal(await resolveAnthropicWorkspace({},'sk-ant-api-personal-5',{fetchImpl:single.fetchImpl}),'wrkspc_only');
});

test('pasting an identity-linked Claude key verifies it through the Default Workspace',async()=>{
  resetAnthropicWorkspaceCache();
  const { preflightProviderSecret }=await import('../ai-provider-control.js');
  const {fetchImpl}=fakeAnthropic();
  const original=globalThis.fetch;
  try{
    globalThis.fetch=fetchImpl;
    const result=await preflightProviderSecret({},'anthropic','ANTHROPIC_API_KEY','sk-ant-api-personal-6');
    assert.equal(result.ok,true);
    assert.equal(result.rejected,false);
  }finally{globalThis.fetch=original}
});
