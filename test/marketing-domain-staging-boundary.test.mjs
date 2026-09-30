import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../'+path, import.meta.url), 'utf8');

test('Marketing domain deployment uses the canonical EKODI auth origin', async () => {
  const [workflow,handoff,config] = await Promise.all([
    read('.github/workflows/deploy-marketing-domain-api.yml'),
    read('marketing-auth-handoff.js'),
    read('wrangler.marketing-domains.toml'),
  ]);
  assert.match(workflow, /ALLOWED_ORIGINS = "https:\/\/ekodi\.kr"/);
  assert.match(workflow, /Origin: https:\/\/ekodi\.kr/);
  assert.match(workflow, /https:\/\/ekodi\.kr\/marketing-api/);
  assert.doesNotMatch(workflow, /Origin: https:\/\/auth\.ekodi\.kr/);
  assert.match(handoff, /const AUTH_ORIGIN = 'https:\/\/ekodi\.kr'/);
  assert.match(handoff, /'https:\/\/cgma\.or\.kr'/);
  assert.doesNotMatch(handoff, /\.ai\.ekodi\.kr/);
  assert.match(config, /ALLOWED_ORIGINS = "https:\/\/ekodi\.kr,https:\/\/cgma\.or\.kr"/);
  assert.doesNotMatch(config, /ALLOWED_ORIGINS = "[^"]*auth\.ekodi\.kr/);
});
