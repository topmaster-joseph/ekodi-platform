import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Mall production verifier guards channel-first admin flow', async () => {
  const workflow = await readFile(new URL('../.github/workflows/verify-ekodi-mall-production.yml', import.meta.url), 'utf8');
  assert.match(workflow, /Verify channel-first admin connection flow/);
  assert.match(workflow, /\/ekodibiz\/mall\/admin\/channels/);
  assert.match(workflow, /data-channel-preauth/);
  assert.match(workflow, /channelPreAuth/);
  assert.match(workflow, /pendingChannelIntent/);
  assert.match(workflow, /automationApi\('\/v1\/policy'/);
  assert.match(workflow, /channelPolicyForm/);
  assert.match(workflow, /channelAiForm/);
  assert.match(workflow, /data-channel-control/);
  assert.match(workflow, /data-job-action/);
  assert.match(workflow, /marketing-connect-api\.ekodi\.kr\/health/);
  assert.match(workflow, /youtubeConfigured/);
  assert.match(workflow, /paidActivation!==false/);
});
