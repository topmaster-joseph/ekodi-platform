import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nativeLocalAiFailureCode} from '../scripts/verify-native-localai.mjs';

test('USER4 native Ollama receipt failures produce only fixed nonsecret codes',()=>{
  const cases=[
    [{ollamaApi:'unavailable'},'native_localai_api_unavailable'],
    [{ollamaApi:'ready',inference:'approved_model_missing'},'native_localai_approved_model_missing'],
    [{ollamaApi:'ready',inference:'api_error_or_timeout'},'native_localai_api_error_or_timeout'],
    [{ollamaApi:'ready',inference:'empty_or_incomplete_response'},'native_localai_empty_or_incomplete_response'],
    [{ollamaApi:'ready',inference:'nonmatching_response'},'native_localai_nonmatching_response'],
    [{ollamaApi:'ready',inference:'not_checked'},'native_localai_not_checked'],
    [{ollamaApi:'ready',inference:'api_error_or_timeout: token=SECRET'},'native_localai_inference_not_ready']
  ];
  for(const [proof,expected] of cases)assert.equal(nativeLocalAiFailureCode(proof),expected);
});
test('Windows native Ollama verifier requires a genuinely completed model response, not exact OK text',()=>{
  const agent=readFileSync(new URL('../tools/ekodi-device-agent/windows/ekodi-device-agent.ps1',import.meta.url),'utf8');
  const start=agent.indexOf('function Get-EkodiLocalAiVerification');
  const end=agent.indexOf('function Get-RemoteAgentStatus',start);
  assert(start>=0&&end>start);
  const verify=agent.slice(start,end);
  assert.match(verify,/127\.0\.0\.1:11434\/api\/version/);
  assert.match(verify,/127\.0\.0\.1:11434\/api\/tags/);
  assert.match(verify,/127\.0\.0\.1:11434\/api\/generate/);
  assert.match(verify,/\$reply\.done -eq \$true/);
  assert.match(verify,/\$reply\.model -eq \[string\]\$model/);
  assert.match(verify,/IsNullOrWhiteSpace\(\[string\]\$reply\.response\)/);
  assert.match(verify,/num_predict = 16/);
  assert.match(verify,/-TimeoutSec 60/);
  assert.match(verify,/empty_or_incomplete_response/);
  assert.doesNotMatch(verify,/\$reply\.response -match '\^\\s\*OK/);
  assert.doesNotMatch(verify,/Write-Host.+\$reply\.response/);
});
