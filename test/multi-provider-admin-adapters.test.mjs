import test from 'node:test';
import assert from 'node:assert/strict';
import { createClaudeProvider, getClaudeProviderStatus } from '../claude-provider-adapter.js';
import { createGeminiProvider, getGeminiProviderStatus } from '../gemini-provider-adapter.js';

function response(data) {
  return { ok:true, status:200, async json(){ return data; } };
}

test('Claude server provider supports EKODI orchestration synthesis context', async () => {
  let requestBody = null;
  const provider = createClaudeProvider({ ENVIRONMENT:'test', ANTHROPIC_API_KEY:'test-key' }, {
    fetchImpl:async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return response({ id:'claude-1', model:'claude-test', content:[{ type:'text', text:'Claude 통합' }], usage:{ input_tokens:10, output_tokens:4 } });
    },
  });
  const value = await provider.invoke({ taskName:'admin-assist:synthesis', context:{
    message:'검토해줘',
    _ekodiOrchestration:{ phase:'synthesis', quorumMet:true, peerReviews:[{ provider:'a', text:'A' },{ provider:'b', text:'B' }] },
  }});
  assert.equal(value.text, 'Claude 통합');
  assert.match(requestBody.messages[0].content, /EKODI Orchestrator 최종 합성 단계/);
  assert.equal(getClaudeProviderStatus({ ANTHROPIC_API_KEY:'x' }).configured, true);
});
test('Gemini server provider supports EKODI orchestration synthesis context', async () => {
  let requestBody = null;
  const provider = createGeminiProvider({ ENVIRONMENT:'test', GEMINI_API_KEY:'test-key' }, {
    fetchImpl:async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return response({
        candidates:[{ content:{ parts:[{ text:'Gemini 통합' }] } }],
        usageMetadata:{ promptTokenCount:8, candidatesTokenCount:3, totalTokenCount:11 },
      });
    },
  });
  const value = await provider.invoke({ taskName:'admin-assist:synthesis', context:{
    message:'검토해줘',
    _ekodiOrchestration:{ phase:'synthesis', quorumMet:true, peerReviews:[{ provider:'a', text:'A' },{ provider:'b', text:'B' }] },
  }});
  assert.equal(value.text, 'Gemini 통합');
  assert.match(requestBody.contents[0].parts[0].text, /EKODI Orchestrator 최종 합성 단계/);
  assert.equal(getGeminiProviderStatus({ GEMINI_API_KEY:'x' }).configured, true);
});
