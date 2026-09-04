import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = await readFile(new URL('../.github/workflows/deploy-site-core.yml', import.meta.url), 'utf8');
const wrangler = await readFile(new URL('../wrangler.site.toml', import.meta.url), 'utf8');

test('shared-site production deploy repairs Cloudflare custom-domain triggers only when needed', () => {
  assert.match(workflow, /Verify and repair Cloudflare custom-domain attachments/);
  assert.match(workflow, /needs_sync=false/);
  assert.match(workflow, /config_changed=false/);
  assert.match(workflow, /wrangler@4\.119\.0 triggers deploy --config wrangler\.site\.toml/);
});

test('public, admin and auth entry hosts remain declared as Worker custom domains', () => {
  for (const host of ['ekodi.kr', 'admin.ekodi.kr', 'auth.ekodi.kr']) {
    const escaped = host.replaceAll('.', '\\.');
    assert.match(wrangler, new RegExp(`pattern = "${escaped}"[\\s\\S]{0,80}custom_domain = true`));
  }
});