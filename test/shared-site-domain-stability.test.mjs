import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('shared site deploy does not rewrite Cloudflare custom domains on every code release', async () => {
  const workflow = await read('.github/workflows/deploy-site-core.yml');
  assert.match(workflow, /Inspect Cloudflare custom-domain attachments/);
  assert.match(workflow, /workers\/domains\?service=shy-thunder-39a4/);
  assert.match(workflow, /for host in ekodi\.kr admin\.ekodi\.kr auth\.ekodi\.kr/);
  assert.match(workflow, /needs_sync=\$needs_sync/);
  assert.match(workflow, /Detect domain configuration change/);
  assert.match(workflow, /git diff --name-only/);
  assert.match(workflow, /wrangler\.site\.toml/);
  assert.match(workflow, /Repair or synchronize Cloudflare custom-domain triggers/);
  assert.match(workflow, /steps\.domain_config\.outputs\.changed == 'true' \|\| steps\.domain_state\.outputs\.needs_sync == 'true'/);
  assert.match(workflow, /Verify Cloudflare custom-domain attachments without mutation/);
});

test('manual deployment exposes an explicit domain-sync switch instead of implicit mutation', async () => {
  const workflow = await read('.github/workflows/deploy-site-core.yml');
  assert.match(workflow, /sync_domains:/);
  assert.match(workflow, /Force Cloudflare custom-domain trigger synchronization/);
  assert.match(workflow, /FORCE_SYNC: \$\{\{ inputs\.sync_domains \}\}/);
});
