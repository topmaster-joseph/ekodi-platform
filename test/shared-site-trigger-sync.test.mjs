import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = await readFile(new URL('../.github/workflows/deploy-site-core.yml', import.meta.url), 'utf8');
const wrangler = await readFile(new URL('../wrangler.site.toml', import.meta.url), 'utf8');

test('shared-site production deploy repairs Cloudflare custom-domain triggers only when needed', () => {
  assert.match(workflow, /Verify and repair Cloudflare custom-domain attachments/);
  assert.match(workflow, /if \[ "\$needs_sync" = 'true' \] \|\| \[ "\$config_changed" = 'true' \]; then/);
  assert.match(workflow, /wrangler@4\.119\.0 triggers deploy --config wrangler\.site\.toml/);
  assert.match(workflow, /payload=\$\(read_domains\)/);
  assert.match(workflow, /Verified Cloudflare Worker domain/);
});

test('canonical public entry is apex-only while Admin and Auth are path-owned', () => {
  const custom = wrangler.split('[[routes]]').slice(1)
    .filter(block => /custom_domain\s*=\s*true/.test(block))
    .map(block => block.match(/pattern\s*=\s*"([^"]+)"/)?.[1])
    .filter(Boolean);
  assert.deepEqual(custom, ['ekodi.kr']);
  assert.match(wrangler, /"\/admin"/);
  assert.match(wrangler, /"\/admin\/\*"/);
  assert.match(wrangler, /"\/auth"/);
  assert.match(wrangler, /"\/auth\/\*"/);
});
