import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../'+path, import.meta.url), 'utf8');

test('Marketing domain staging verifies the deployed remote worker and apex auth origin', async () => {
  const [workflow,handoff] = await Promise.all([
    read('.github/workflows/deploy-marketing-domain-api.yml'),
    read('marketing-auth-handoff.js'),
  ]);
  assert.match(workflow, /base='https:\/\/ekodi-marketing-domain-api-staging\.ekodi-development\.workers\.dev'/);
  assert.match(workflow, /Origin: https:\/\/ekodi\.kr/);
  assert.match(workflow, /access-control-allow-origin: https:\/\/ekodi\.kr/);
  assert.doesNotMatch(workflow, /wrangler@\$WRANGLER_VERSION dev --local/);
  assert.doesNotMatch(workflow, /Origin: https:\/\/auth\.ekodi\.kr/);
  assert.match(handoff, /const AUTH_ORIGIN = 'https:\/\/ekodi\.kr'/);
});
