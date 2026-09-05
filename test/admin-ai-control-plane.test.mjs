import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const runtime = fs.readFileSync(new URL('../ai-governance-runtime.js', import.meta.url), 'utf8');
const cloudflare = fs.readFileSync(new URL('../cloudflare-secret-control.js', import.meta.url), 'utf8');
const ui = fs.readFileSync(new URL('../admin-ai-control-plane.js', import.meta.url), 'utf8');
const bootstrap = fs.readFileSync(new URL('../admin-assist-bootstrap.js', import.meta.url), 'utf8');

test('Chief AI remains primary while specialist AI access is direct and bounded', () => {
  assert.match(runtime, /primaryAdminInterface: 'chief'/);
  assert.match(runtime, /directSpecialistAccess: true/);
  assert.match(runtime, /serviceFirstControlPlane: true/);
  assert.match(runtime, /providerConsoles: 'advanced_or_emergency_only'/);
  for (const id of ['infrastructure','development','devops','security','data','ai_gateway']) {
    assert.match(runtime, new RegExp(`${id}: Object\\.freeze`));
  }
});

test('sovereign provider mutations remain human-gated while safe bounded production is delegated', () => {
  for (const area of ['permission_expanding_or_root_secret_change','new_domain_ownership_or_security_boundary','repository_force_push','repository_delete','irreversible_or_authority_expanding_production_rollback']) {
    assert.match(runtime, new RegExp(`['"]${area}['"]`));
  }
  assert.match(runtime, /bounded_production/);
});

test('Cloudflare inventory exposes account, zones and workers without exposing controller credentials', () => {
  assert.match(cloudflare, /cloudflareInventory/);
  assert.match(cloudflare, /account:\{ name:/);
  assert.match(cloudflare, /zones:\[\]/);
  assert.match(cloudflare, /workers:fallbackWorkers/);
  assert.match(cloudflare, /idMasked/);
  assert.match(cloudflare, /inventoryWarnings/);
  assert.doesNotMatch(cloudflare, /token:\s*env\.CLOUDFLARE_SECRET_MANAGER_TOKEN/);
});

test('GitHub inventory works publicly and can upgrade to authenticated mode', () => {
  assert.match(cloudflare, /GITHUB_CONTROL_OWNER/);
  assert.match(cloudflare, /GITHUB_CONTROL_TOKEN/);
  assert.match(cloudflare, /api\.github\.com\/users/);
  assert.match(cloudflare, /api\.github\.com\/user\/repos/);
  assert.match(cloudflare, /mode:token \? 'authenticated' : 'public'/);
});

test('Admin control plane UI renders provider context and specialist selector', () => {
  assert.doesNotThrow(() => new Function(ui));
  assert.match(ui, /Cloudflare 계정/);
  assert.match(ui, /Zone \/ 도메인/);
  assert.match(ui, /대상 Worker/);
  assert.match(ui, /Infrastructure AI/);
  assert.match(ui, /Development AI/);
  assert.match(ui, /GitOps\/Actions 가드 사용/);
  assert.match(bootstrap, /admin-ai-control-plane\.js/);
});
