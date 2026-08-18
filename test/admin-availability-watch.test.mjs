import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = await readFile(new URL('../.github/workflows/admin-availability-watch.yml', import.meta.url), 'utf8');
const staleWatch = await readFile(new URL('../.github/workflows/admin-monitor-stale-watch.yml', import.meta.url), 'utf8');

test('admin availability watch verifies canonical plus truly independent emergency paths', () => {
  assert.match(workflow, /cron: '\*\/15 \* \* \* \*'/);
  assert.match(workflow, /CANONICAL_ORIGIN: https:\/\/admin\.ekodi\.kr/);
  assert.match(workflow, /EMERGENCY_ORIGIN: https:\/\/ekodi-admin-staging\.topmaster-joseph\.workers\.dev/);
  assert.match(workflow, /\$CANONICAL_ORIGIN\/admin/);
  assert.match(workflow, /\$EMERGENCY_ORIGIN\/health/);
  assert.doesNotMatch(workflow, /https:\/\/ekodi\.kr\/admin/);
});

test('watch uses independent Cloudflare control plane, Cloudflare DNS, Google DNS, and semantic HTTP observers', () => {
  assert.match(workflow, /workers\/scripts\/ekodi-admin-staging/);
  assert.match(workflow, /cloudflare-dns\.com\/dns-query\?name=\$host&type=A/);
  assert.match(workflow, /dns\.google\/resolve\?name=\$host&type=A/);
  assert.match(workflow, /canonical_http=\$canonical_http/);
  assert.match(workflow, /emergency_http=\$emergency_http/);
});

test('one observer failure is warning only and two or more failures are required for confirmed outage', () => {
  assert.match(workflow, /\[ "\$canonical_failures" -ge 2 \] && canonical_confirmed=true/);
  assert.match(workflow, /\[ "\$emergency_failures" -ge 2 \] && emergency_confirmed=true/);
  assert.match(workflow, /\[ "\$canonical_failures" -eq 1 \] && canonical_warning=true/);
  assert.match(workflow, /incident=observer-warning/);
  assert.match(workflow, /A single observer failure is explicitly not an outage/);
});

test('automatic repair is quorum-gated and keeps canonical and emergency recovery isolated', () => {
  assert.match(workflow, /steps\.quorum\.outputs\.canonical_confirmed == 'true'/);
  assert.match(workflow, /wrangler@4\.119\.0 triggers deploy --config wrangler\.site\.toml/);
  assert.match(workflow, /steps\.quorum\.outputs\.emergency_confirmed == 'true'/);
  assert.match(workflow, /wrangler@4\.119\.0 deploy --config wrangler\.admin\.staging\.toml/);
  assert.doesNotMatch(workflow, /-X DELETE/);
  assert.doesNotMatch(workflow, /dns_records[^\n]*-X POST/);
  assert.doesNotMatch(workflow, /workers\/domains[^\n]*-X DELETE/);
});

test('final verification distinguishes observer warning and confirmed incident classes', () => {
  assert.match(workflow, /incident=observer-warning/);
  assert.match(workflow, /incident=canonical-only/);
  assert.match(workflow, /incident=emergency-only/);
  assert.match(workflow, /incident=full-outage/);
  assert.match(workflow, /Admin classification: \$incident/);
});

test('stale watchdog distinguishes monitoring failure from service failure', () => {
  assert.match(staleWatch, /cron: '7,37 \* \* \* \*'/);
  assert.match(staleWatch, /STALE_AFTER_SECONDS: 2400/);
  assert.match(staleWatch, /MONITOR STALE: admin-availability-watch/);
  assert.match(staleWatch, /The admin service has NOT been declared down/);
  assert.match(staleWatch, /Do not change DNS or redeploy production solely because of this alert/);
  assert.match(staleWatch, /gh issue close/);
});

test('confirmed failure becomes a durable incident without duplicate issue spam', () => {
  assert.match(workflow, /if: failure\(\)/);
  assert.match(workflow, /Admin availability incident: admin\.ekodi\.kr/);
  assert.match(workflow, /multi-observer quorum/);
  assert.match(workflow, /gh issue list --state open/);
  assert.match(workflow, /gh issue comment/);
  assert.match(workflow, /gh issue create/);
});
