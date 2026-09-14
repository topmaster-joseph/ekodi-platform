import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = await readFile(new URL('../.github/workflows/verify-ai-gateway-production.yml', import.meta.url), 'utf8');

test('AI Commons production verification follows the canonical guarded owner', () => {
  assert.match(workflow, /workflows: \['Deploy EKODI AI Control Plane'\]/);
  assert.match(workflow, /github\.event_name == 'workflow_dispatch'/);
  assert.match(workflow, /github\.event\.workflow_run\.head_branch == 'main'/);
  assert.match(workflow, /github\.event\.workflow_run\.conclusion == 'success'/);
});

test('AI Commons production verification matches the canonical public and member boundary', () => {
  assert.match(workflow, /canonical_code.*https:\/\/ekodi\.kr\/ai'/);
  assert.match(workflow, /root_code.*https:\/\/ekodi\.kr\/ai\//);
  assert.match(workflow, /\[ "\$canonical_code" = '200' \]/);
  assert.doesNotMatch(workflow, /\[ "\$canonical_code" = '308' \]/);
  assert.match(workflow, /health_code.*\/ai\/__health/);
  assert.match(workflow, /services_code.*\/api\/commons\/services/);
  assert.match(workflow, /requests_code.*\/api\/commons\/requests/);
  assert.match(workflow, /ideas_code.*\/api\/commons\/ideas/);
  assert.match(workflow, /ai-canonical-headers[\s\S]*x-ekodi-canonical-surface: ai/);
  assert.match(workflow, /ai-canonical-headers[\s\S]*x-ekodi-canonical-path: \/ai/);
  assert.match(workflow, /x-ekodi-canonical-surface: ai/);
  assert.match(workflow, /x-ekodi-canonical-path: \/ai/);
  assert.match(workflow, /surface.*runtime-and-commons/);
  assert.match(workflow, /EKODI 모두의 AI 프로젝트/);
});

test('manual AI Commons production verification remains available', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /Verify AI Commons production contract/);
});
