import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = await readFile(new URL('../.github/workflows/verify-ai-gateway-provider-production.yml', import.meta.url), 'utf8');
const verifier = await readFile(new URL('../scripts/verify-ai-gateway-authenticated-production.mjs', import.meta.url), 'utf8');

test('provider production verification follows guarded Control API ownership', () => {
  assert.match(workflow, /workflows: \['Deploy Control API'\]/);
  assert.match(workflow, /github\.event\.workflow_run\.event != 'pull_request'/);
  assert.match(workflow, /github\.event\.workflow_run\.conclusion == 'success'/);
  assert.match(workflow, /verify-ai-gateway-authenticated-production\.mjs/);
  assert.match(verifier, /Issue short-lived genuine super-admin session/);
  assert.match(verifier, /Verify Workers AI with an authenticated production request/);
  assert.match(verifier, /cloudflare-workers-ai/);
  assert.match(verifier, /Revoke short-lived AI Gateway verification session/);
});

test('provider verification keeps unauthenticated Gateway status closed', () => {
  assert.match(workflow, /provider-status/);
  assert.match(workflow, /\[ "\$status" = '401' \]/);
  assert.match(workflow, /\[ "\$status" = '403' \]/);
});
