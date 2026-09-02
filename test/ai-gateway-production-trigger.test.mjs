import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = await readFile(new URL('../.github/workflows/verify-ai-gateway-production.yml', import.meta.url), 'utf8');
const liveVerifier = await readFile(new URL('../scripts/verify-ai-gateway-authenticated-production.mjs', import.meta.url), 'utf8');

test('AI Gateway production verification follows the guarded Control API owner', () => {
  assert.match(workflow, /github\.event_name == 'workflow_dispatch'/);
  assert.match(workflow, /github\.event\.workflow_run\.event != 'pull_request'/);
  assert.match(workflow, /github\.event\.workflow_run\.conclusion == 'success'/);
  assert.match(workflow, /workflows: \['Deploy Control API'\]/);
  assert.match(workflow, /verify-ai-gateway-authenticated-production\.mjs/);
  assert.match(liveVerifier, /Issue short-lived genuine super-admin session/);
  assert.match(liveVerifier, /Verify Workers AI with an authenticated production request/);
  assert.match(liveVerifier, /cloudflare-workers-ai/);
  assert.match(liveVerifier, /Revoke short-lived AI Gateway verification session/);
});

test('manual AI Gateway production verification remains available', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /Verify AI Gateway production contract/);
});
