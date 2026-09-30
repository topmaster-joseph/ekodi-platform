import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile(new URL('../deploy/manifests/shared-site.worker.json', import.meta.url), 'utf8'));
const worker = await readFile(new URL('../site-worker.js', import.meta.url), 'utf8');
const authSurface = await readFile(new URL('../canonical-surface-router.js', import.meta.url), 'utf8');
const workflow = await readFile(new URL('../.github/workflows/deploy-site-core.yml', import.meta.url), 'utf8');
const stagingWorkflow = await readFile(new URL('../.github/workflows/stage-shared-site-shell.yml', import.meta.url), 'utf8');
const zeroSubdomainGuard = await readFile(new URL('../scripts/zero-subdomain-guard.mjs', import.meta.url), 'utf8');

const urls = manifest.worker.requests.map(item => item.url);

test('shared-site guarded release verifies only apex paths owned by the shared Worker', () => {
  assert.ok(urls.length > 0);
  const nonApex = urls.filter(url => !String(url).startsWith('https://ekodi.kr/'));
  assert.deepEqual(nonApex, [],
    `Shared Site release must not depend on independent or legacy hosts: ${nonApex.join(', ')}`);
  assert.match(authSurface, /const AUTH_ASSETS=new Set/);
  assert.match(authSurface, /serveCanonicalAuth/);
  assert.doesNotMatch(worker, /const AUTH_HOST/);
  assert.match(worker, /const ADMIN_HOSTS = new Set/);
});

test('shared-site smoke contracts are unique by HTTP method and canonical URL', () => {
  const signatures = manifest.worker.requests.map(item => `${String(item.method || 'GET').toUpperCase()} ${item.url}`);
  const duplicates = signatures.filter((signature,index) => signatures.indexOf(signature) !== index);
  assert.deepEqual(duplicates, [], `Duplicate Shared Site smoke contracts: ${[...new Set(duplicates)].join(', ')}`);
});

test('shared-site release watches Invest root runtime assets', () => {
  assert.match(workflow, /- 'invest-user-page\.js'/);
  assert.match(workflow, /- 'invest-subject-ui\.js'/);
  assert.match(workflow, /- 'invest-site-system\.js'/);
});

test('shared-site production blocks a rerun of an older commit before deployment', () => {
  assert.match(workflow, /Refuse stale rerun production promotion/);
  assert.match(workflow, /GITHUB_RUN_ATTEMPT/);
  assert.match(workflow, /git ls-remote origin refs\/heads\/main/);
  assert.match(workflow, /if \[ "\$GITHUB_SHA" != "\$latest_main" \]/);
  assert.match(workflow, /exit 42/);
  assert.match(workflow, /group: ekodi-shared-site-worker-production/);
});


test('shared-site staging and governance checks stay apex-path-only', () => {
  assert.doesNotMatch(stagingWorkflow, /verify_shell\s*\(/);
  assert.doesNotMatch(stagingWorkflow, /(?<!@)\b(?:[a-z0-9-]+\.)+ekodi\.kr\b/i);
  assert.match(stagingWorkflow, /verify_public_path '\/pay' 'EKODI Pay' 'x-ekodi-canonical-surface: pay'/);
  assert.match(stagingWorkflow, /verify_public_path '\/cloud' 'EKODI Hub' 'x-ekodi-canonical-surface: cloud'/);
  assert.match(stagingWorkflow, /verify_public_path '\/ekodibiz\/trade' 'PRIVATE TRADE WORKSPACE' 'x-ekodi-route: trade-partner-workspace'/);
  assert.match(zeroSubdomainGuard, /shared-site release request must use canonical apex/);
  assert.match(zeroSubdomainGuard, /deploy\/manifests\/shared-site\.worker\.json/);
});
