import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const OLD = ['church', 'ekodi', 'kr'].join('.');
const CANON = 'ekodi.kr/ekodichurch';

test('Church operating registries advertise the canonical apex path, not the retired host', async () => {
  for (const path of [
    'api-worker.js',
    'ekodi-site-policy.js',
    'ai-ops-admin.js',
    'admin-lazy-features.js',
    'campus-actions.js',
    'system-capacity-admin.js'
  ]) {
    const source = await read(path);
    assert.ok(source.includes(CANON), path + ' must refer to the Church canonical path');
    assert.ok(!source.includes(OLD), path + ' must not advertise the retired Church hostname');
  }
});

test('Church safe retirement is scoped to the one hostname and preserves unrelated DNS', async () => {
  const src = await read('scripts/retire-church-legacy-domain.mjs');
  assert.match(src, /export const LEGACY_HOST = \['church', 'ekodi', 'kr'\]\.join/);
  assert.match(src, /export const CANONICAL = 'https:\/\/ekodi\.kr\/ekodichurch\/'/);
  assert.match(src, /new Set\(\['A', 'AAAA', 'CNAME'\]\)/);
  assert.match(src, /preservedDns/);
  assert.match(src, /Unexpected Pages owner/);
  assert.match(src, /Unexpected Worker-domain owner/);
  assert.match(src, /Unexpected Worker route owner/);
  assert.match(src, /await canonicalHealthy\(\)/);
  assert.match(src, /if \(!execute\)/);
  assert.doesNotMatch(src, /redirect:\s*'follow'/);
});

test('production retirement requires the approved governance and production protected workflow', async () => {
  const flow = await read('.github/workflows/retire-church-legacy-domain.yml');
  assert.match(flow, /environment: production/);
  assert.match(flow, /validate-ekodi-ai-change-orchestration\.mjs/);
  assert.match(flow, /cloudflare-production-budget\.mjs/);
  assert.match(flow, /skip_nonessential/);
  assert.match(flow, /--execute/);
  assert.match(flow, /--self-test/);
  const amendment = JSON.parse(await read('governance/amendments/2026-09-13-church-lab-subdomain-retirement-v1.12.0.json'));
  assert.equal(amendment.changeClass, 'C3');
  assert.equal(amendment.status, 'approved');
});
