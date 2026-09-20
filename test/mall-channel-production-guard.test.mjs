import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('production verifier guards multi-account channel flow across subservices', async () => {
  const workflow = await readFile(new URL('../.github/workflows/verify-ekodi-mall-production.yml', import.meta.url), 'utf8');
  assert.match(workflow, /Verify multi-account channel admin flow/);
  assert.match(workflow, /\/ekodibiz\/ekodimall\/admin\/channels/);
  assert.match(workflow, /channelAccountForm/);
  assert.match(workflow, /data-account-auth/);
  assert.match(workflow, /registryConnectionId/);
  assert.match(workflow, /externalAccountApi/);
  assert.match(workflow, /\/cgma\/admin\/publishing/);
  assert.match(workflow, /\/ekodibiz\/trade\/admin\/publishing/);
  assert.match(workflow, /\/jadam\/admin\/publishing/);
  assert.match(workflow, /ekodi\.kr\/marketing-connect-api\/health/);
  assert.match(workflow, /ekodi\.kr\/marketing-publish-api\/health/);
  assert.match(workflow, /youtubeConfigured/);
  assert.match(workflow, /paidActivation!==false/);
  assert.match(workflow, /github\.event_name == 'push'/);
});
