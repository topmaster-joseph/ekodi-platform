import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = await readFile(new URL('../.github/workflows/admin-availability-watch.yml', import.meta.url), 'utf8');

test('admin availability watch runs continuously and verifies canonical plus compatibility paths', () => {
  assert.match(workflow, /cron: '\*\/15 \* \* \* \*'/);
  assert.match(workflow, /probe_admin canonical_admin 'https:\/\/ekodi\.kr\/admin\/' 'admin-shell'/);
  assert.match(workflow, /probe_redirect canonical_slash 'https:\/\/ekodi\.kr\/admin' 'https:\/\/ekodi\.kr\/admin\/'/);
  assert.match(workflow, /probe_redirect legacy_root 'https:\/\/admin\.ekodi\.kr\/' 'https:\/\/ekodi\.kr\/admin\/\?source=admin\.ekodi\.kr'/);
  assert.match(workflow, /probe_redirect legacy_admin 'https:\/\/admin\.ekodi\.kr\/admin' 'https:\/\/ekodi\.kr\/admin\/\?source=admin\.ekodi\.kr'/);
  assert.match(workflow, /probe_redirect legacy_retired 'https:\/\/admin\.ekodi\.kr\/control-center\.html' 'https:\/\/ekodi\.kr\/admin\/\?source=admin\.ekodi\.kr'/);
  assert.match(workflow, /<title>EKODI Admin<\/title>/);
  assert.match(workflow, /\[ "\$status" = 308 \]/);
  assert.doesNotMatch(workflow, /admin-fallback/);
});

test('watch validates independent DNS and Cloudflare attachment state before compatibility repair', () => {
  assert.match(workflow, /workers\/domains\?service=shy-thunder-39a4/);
  assert.match(workflow, /dns_records\?name=admin\.ekodi\.kr/);
  assert.match(workflow, /cloudflare-dns\.com\/dns-query\?name=admin\.ekodi\.kr&type=A/);
  assert.match(workflow, /dns\.google\/resolve\?name=admin\.ekodi\.kr&type=A/);
  assert.match(workflow, /needs_repair=\$needs_repair/);
});

test('automatic repair is narrow, conditional and never deletes or recreates DNS', () => {
  assert.match(workflow, /if: steps\.infra\.outputs\.needs_repair == 'true'/);
  assert.match(workflow, /wrangler@4\.119\.0 triggers deploy --config wrangler\.site\.toml/);
  assert.doesNotMatch(workflow, /-X DELETE/);
  assert.doesNotMatch(workflow, /dns_records[^\n]*-X POST/);
  assert.doesNotMatch(workflow, /workers\/domains[^\n]*-X DELETE/);
});

test('persistent failure becomes a durable Chief AI incident without duplicate issue spam', () => {
  assert.match(workflow, /if: failure\(\)/);
  assert.match(workflow, /Admin availability incident: canonical EKODI Admin/);
  assert.match(workflow, /gh issue list --state open/);
  assert.match(workflow, /gh issue comment/);
  assert.match(workflow, /gh issue create/);
});
