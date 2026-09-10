import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = await readFile(new URL('../.github/workflows/verify-ai-gateway-production.yml', import.meta.url), 'utf8');

test('AI Runtime production verification follows the canonical guarded owner', () => {
  assert.match(workflow, /workflows: \['Deploy EKODI AI Control Plane'\]/);
  assert.match(workflow, /github\.event_name == 'workflow_dispatch'/);
  assert.match(workflow, /github\.event\.workflow_run\.event != 'pull_request'/);
  assert.match(workflow, /github\.event\.workflow_run\.conclusion == 'success'/);
});

test('AI Runtime production verification matches the runtime-only boundary', () => {
  assert.match(workflow, /root_code.*ai\.ekodi\.kr\//);
  assert.match(workflow, /health_code.*\/__health/);
  assert.match(workflow, /config_code.*\/config\.js/);
  assert.match(workflow, /status_code.*\/api\/status/);
  assert.match(workflow, /exchange_code.*\/api\/auth\/exchange/);
  assert.match(workflow, /ai-runtime-admin-handoff/);
  assert.match(workflow, /surface.*runtime-only/);
  assert.doesNotMatch(workflow, /ai-gateway\.js/);
  assert.doesNotMatch(workflow, /\/api\/control\/ai\/provider-status/);
});

test('manual AI Runtime production verification remains available', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /Verify AI Runtime production contract/);
});
