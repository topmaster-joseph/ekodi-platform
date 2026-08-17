import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = await readFile(new URL('../.github/workflows/admin-availability-watch.yml', import.meta.url), 'utf8');

test('admin availability watch runs continuously and verifies canonical plus independent emergency paths', () => {
  assert.match(workflow, /cron: '\*\/15 \* \* \* \*'/);
  assert.match(workflow, /CANONICAL_ORIGIN: https:\/\/admin\.ekodi\.kr/);
  assert.match(workflow, /EMERGENCY_ORIGIN: https:\/\/ekodi-admin-staging\.topmaster-joseph\.workers\.dev/);
  assert.match(workflow, /\$CANONICAL_ORIGIN\/admin/);
  assert.match(workflow, /\$EMERGENCY_ORIGIN\/health/);
  assert.doesNotMatch(workflow, /https:\/\/ekodi\.kr\/admin/);
});

test('watch validates canonical and emergency DNS through independent resolvers', () => {
  assert.match(workflow, /cloudflare-dns\.com\/dns-query\?name=\$host&type=A/);
  assert.match(workflow, /dns\.google\/resolve\?name=\$host&type=A/);
  assert.match(workflow, /resolve_a admin\.ekodi\.kr/);
  assert.match(workflow, /resolve_a ekodi-admin-staging\.topmaster-joseph\.workers\.dev/);
  assert.match(workflow, /canonical_dns=\$canonical_dns/);
  assert.match(workflow, /emergency_dns=\$emergency_dns/);
});

test('automatic repair keeps canonical and emergency recovery isolated', () => {
  assert.match(workflow, /if: steps\.infra\.outputs\.needs_repair == 'true'/);
  assert.match(workflow, /wrangler@4\.119\.0 triggers deploy --config wrangler\.site\.toml/);
  assert.match(workflow, /steps\.endpoints\.outputs\.emergency_root != 'ok'/);
  assert.match(workflow, /wrangler@4\.119\.0 deploy --config wrangler\.admin\.staging\.toml/);
  assert.doesNotMatch(workflow, /-X DELETE/);
  assert.doesNotMatch(workflow, /dns_records[^\n]*-X POST/);
  assert.doesNotMatch(workflow, /workers\/domains[^\n]*-X DELETE/);
});

test('final verification distinguishes canonical-only, emergency-only and full outage incidents', () => {
  assert.match(workflow, /incident=canonical-only/);
  assert.match(workflow, /incident=emergency-only/);
  assert.match(workflow, /incident=full-outage/);
  assert.match(workflow, /Admin classification: \$incident/);
});

test('persistent failure becomes a durable Chief AI incident without duplicate issue spam', () => {
  assert.match(workflow, /if: failure\(\)/);
  assert.match(workflow, /Admin availability incident: admin\.ekodi\.kr/);
  assert.match(workflow, /independent emergency: \$EMERGENCY_ORIGIN/);
  assert.match(workflow, /gh issue list --state open/);
  assert.match(workflow, /gh issue comment/);
  assert.match(workflow, /gh issue create/);
});
