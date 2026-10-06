import test from 'node:test';
import assert from 'node:assert/strict';
import { EKODI_MCP_CLIENT_POLICY, publicEkodiMcpClientPolicy } from '../mcp-client-policy.js';
import { callPublicEkodiMcpExtensionTool } from '../ekodi-mcp-external-tools.js';

test('MCP client policy is provider-neutral across OpenAI surfaces',()=>{
  const ids=EKODI_MCP_CLIENT_POLICY.clientClasses.map(item=>item.id);
  for(const id of ['chatgpt','openai-responses-api','openai-agents-api','openai-codex','generic-mcp-oauth'])assert.ok(ids.includes(id),id);
  assert.equal(EKODI_MCP_CLIENT_POLICY.onboarding.dynamicRegistrationDefault,false);
  assert.equal(EKODI_MCP_CLIENT_POLICY.onboarding.preRegisteredClientPreferred,true);
  assert.equal(EKODI_MCP_CLIENT_POLICY.onboarding.pkceS256Required,true);
  assert.equal(EKODI_MCP_CLIENT_POLICY.onboarding.explicitUserConsentRequired,true);
  assert.equal(EKODI_MCP_CLIENT_POLICY.authorization.clientIdAloneIsAuthorization,false);
  assert.equal(EKODI_MCP_CLIENT_POLICY.authorization.activeConsentRequired,true);
  assert.equal(EKODI_MCP_CLIENT_POLICY.authorization.canonicalResourceGrantRequired,true);
  assert.equal(EKODI_MCP_CLIENT_POLICY.authorization.orchestratorIsExecutionAuthority,true);
});

test('public MCP discovery exposes only bounded client policy',()=>{
  const result=callPublicEkodiMcpExtensionTool('identify_ekodi');
  assert.equal(result.structuredContent.mcpClientPolicy.canonicalResource,'https://ekodi.kr/mcp');
  assert.deepEqual(result.structuredContent.mcpClientPolicy,publicEkodiMcpClientPolicy());
  assert.equal(result.structuredContent.mcpClientPolicy.authorization.clientIdAloneIsAuthorization,false);
});
