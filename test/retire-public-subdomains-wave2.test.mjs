import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PLATFORM_LEGACY_HOST_PATHS, platformHost } from '../platform-route-registry.js';

// 2026-11-01: wave 2 of the zero-subdomain retirement. Every first-level public Worker
// subdomain below is reached by EKODI code only through the apex ekodi.kr/<path> service
// binding; the staged plan detaches the domains with scripts/retire-worker-custom-domains.mjs.
const WAVE2 = Object.freeze({
  author: ['wrangler.author.toml'],
  bible: ['wrangler.bible.toml'],
  books: ['wrangler.books.toml'],
  edu: ['wrangler.education.toml'],
  exp: ['wrangler.experience.toml'],
  try: ['wrangler.experience.toml'],
  dev: ['wrangler.experience.toml'],
  journal: ['wrangler.journal.toml'],
  life: ['wrangler.life.toml'],
  management: ['wrangler.management.toml'],
  'marketing-api': ['wrangler.marketing-domains.toml'],
  'marketing-publish-api': ['wrangler.marketing-publishing.toml'],
  'personal-finance-api': ['wrangler.personal-finance.toml'],
  publishing: ['wrangler.publishing.toml'],
  space: ['wrangler.space.toml'],
  drive: ['wrangler.storage.toml'],
  'workspace-api': ['wrangler.workspace-platform.toml', 'wrangler.workspace-platform-bootstrap.toml'],
});

const config = JSON.parse(fs.readFileSync('config/retire-public-subdomains-wave2.json', 'utf8'));
const workerName = file => fs.readFileSync(file, 'utf8').match(/^name\s*=\s*"([^"]+)"/m)?.[1] || '';
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('retirement config targets all 17 wave 2 subdomains with the owning Worker service', () => {
  assert.equal(Object.keys(WAVE2).length, 17);
  const byLabel = new Map(config.targets.map(target => [target.label, target]));
  assert.equal(byLabel.size, config.targets.length, 'labels are unique');
  for (const [label, tomls] of Object.entries(WAVE2)) {
    const target = byLabel.get(label);
    assert.ok(target, `${label} is a retirement target`);
    assert.match(target.label, /^[a-z0-9-]+$/);
    assert.ok(target.service.startsWith('ekodi-'), label);
    for (const toml of tomls) assert.equal(target.service, workerName(toml), `${label} service matches ${toml}`);
    const canonicalPath = PLATFORM_LEGACY_HOST_PATHS[platformHost(label)];
    assert.ok(canonicalPath, `${label} has a canonical apex path`);
    assert.ok(target.apexHealth.startsWith(`https://ekodi.kr${canonicalPath}/`), `${label} health runs on ${canonicalPath}`);
    assert.ok(Array.isArray(target.apexExpect), label);
    assert.equal(target.directHealth, undefined, `${label} has no direct workers.dev probe`);
  }
});

test('wave 2 is staged: domains stay attached until the deploy smoke tests stop probing them', () => {
  const plan = JSON.parse(fs.readFileSync('config/retire-public-subdomains-wave2.json', 'utf8'));
  assert.equal(plan.status, 'staged');
  const wave1 = JSON.parse(fs.readFileSync('config/retire-public-subdomains-wave1.json', 'utf8'));
  for (const label of Object.keys(WAVE2)) assert.ok(!wave1.targets.some(t => t.label === label), `${label} is not in the auto-run wave 1 plan`);
});

test('wave 2 release manifests verify the apex path, never a retired host', () => {
  const retired = Object.keys(WAVE2).map(label => `https://${platformHost(label)}`);
  for (const file of fs.readdirSync('deploy/manifests').filter(name => name.endsWith('.json'))) {
    const manifest = JSON.parse(fs.readFileSync(`deploy/manifests/${file}`, 'utf8'));
    for (const request of manifest.worker?.requests || []) {
      for (const origin of retired) {
        assert.ok(!String(request.url || '').startsWith(origin), `${file} still probes ${request.url}`);
      }
    }
  }
});

test('retirement dry run accepts the full plan', async () => {
  const { spawnSync } = await import('node:child_process');
  const result = spawnSync(process.execPath, ['scripts/retire-worker-custom-domains.mjs', '--config', 'config/retire-public-subdomains-wave2.json', '--dry-run'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  for (const label of Object.keys(WAVE2)) assert.match(result.stdout, new RegExp(`^PLAN ${escape(label)} -> ekodi-`, 'm'));
});
