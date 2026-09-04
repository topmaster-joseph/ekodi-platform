import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('shared site deploy verifies domains and mutates triggers only when repair is needed', async () => {
  const workflow = await read('.github/workflows/deploy-site-core.yml');
  assert.match(workflow, /Verify and repair Cloudflare custom-domain attachments/);
  assert.match(workflow, /workers\/domains\?service=shy-thunder-39a4/);
  assert.match(workflow, /needs_sync=false/);
  assert.match(workflow, /config_changed=false/);
  assert.match(workflow, /git diff --name-only/);
  assert.match(workflow, /if \[ "\$needs_sync" = 'true' \] \|\| \[ "\$config_changed" = 'true' \]; then[\s\S]*wrangler@4\.119\.0 triggers deploy --config wrangler\.site\.toml/);
  assert.match(workflow, /Verified Cloudflare Worker domain/);
});
test('manual deployment exposes an explicit domain-sync switch instead of implicit mutation', async () => {
  const workflow = await read('.github/workflows/deploy-site-core.yml');
  assert.match(workflow, /sync_domains:/);
  assert.match(workflow, /Force Cloudflare custom-domain trigger synchronization/);
  assert.match(workflow, /FORCE_SYNC: \$\{\{ inputs\.sync_domains \}\}/);
});
