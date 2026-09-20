import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = await readFile(new URL('../.github/workflows/deploy-site-core.yml', import.meta.url), 'utf8');
const wrangler = await readFile(new URL('../wrangler.site.toml', import.meta.url), 'utf8');

test('admin performance postbuild changes trigger the shared-site production lane', () => {
  assert.match(workflow, /scripts\/admin-performance-postbuild\.mjs/);
  assert.match(workflow, /test\/admin-performance-hardening\.test\.mjs/);
});

test('shared-site production deploy repairs Cloudflare custom-domain triggers only when needed', () => {
  assert.match(workflow, /Verify and repair Cloudflare custom-domain attachments/);
  assert.match(workflow, /if \[ "\$needs_sync" = 'true' \] \|\| \[ "\$config_changed" = 'true' \]; then/);
  assert.match(workflow, /wrangler@4\.119\.0 triggers deploy --config wrangler\.site\.toml/);
  assert.match(workflow, /payload=\$\(read_domains\)/);
  assert.match(workflow, /Verified Cloudflare Worker domain/);
});

test('canonical public and Admin entry hosts remain declared while Auth is path-owned', () => {
  for (const host of ['ekodi.kr', ['admin','ekodi.kr'].join('.')]) {
    const escaped = host.replaceAll('.', '\\.');
    assert.match(wrangler, new RegExp(`pattern = "${escaped}"[\\s\\S]{0,80}custom_domain = true`));
  }
  const retiredAuthHost=['auth','ekodi.kr'].join('.');
  assert.equal(wrangler.includes(`pattern = "${retiredAuthHost}"`),false);
  assert.match(wrangler, /"\/auth"/);
  assert.match(wrangler, /"\/auth\/\*"/);
});
