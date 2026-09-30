import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow=fs.readFileSync(new URL('../.github/workflows/deploy-control-api.yml',import.meta.url),'utf8');

test('Control production boundary probes retry transient network failures',()=>{
  assert.match(workflow,/curl_retry=\(--retry 3 --retry-delay 2 --retry-all-errors --connect-timeout 5 --max-time 12\)/);
  for(const endpoint of [
    'https://ekodi.kr/api/health',
    'https://ekodi.kr/api/ai-modules/v1/health',
    'https://ekodi.kr/api/control/ai/governance',
    'https://ekodi.kr/api/membership/catalog?site=invest',
    'https://ekodi.kr/mcp',
  ]){
    assert.ok(workflow.includes(endpoint),endpoint+' must remain in the production boundary probe');
  }
  assert.ok((workflow.match(/"\$\{curl_retry\[@\]\}"/g)||[]).length>=10,'production boundary probes must use bounded retry');
});

test('Control production boundary contract remains strict after retries',()=>{
  for(const assertion of [
    '[ "$devices" = \'401\' ]',
    '[ "$ai" = \'401\' ]',
    '[ "$learning_catalog" = \'200\' ]',
    '[ "$membership" = \'401\' ]',
    '[ "$catalog" = \'200\' ]',
    '[ "$personal_finance" = \'401\' ]',
  ]) assert.ok(workflow.includes(assertion),assertion+' must remain enforced');
  assert.match(workflow,/PF_ADMIN_AUTH_REQUIRED/);
  assert.match(workflow,/ekodi-learning-fabric/);
});
