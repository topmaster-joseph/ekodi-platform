import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile(new URL('../deploy/manifests/shared-site.worker.json', import.meta.url), 'utf8'));
const worker = await readFile(new URL('../site-worker.js', import.meta.url), 'utf8');
const authSurface = await readFile(new URL('../canonical-surface-router.js', import.meta.url), 'utf8');
const workflow = await readFile(new URL('../.github/workflows/deploy-site-core.yml', import.meta.url), 'utf8');

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

test('shared-site production blocks a rerun of an older commit before deployment', () => {
  assert.match(workflow, /Refuse stale rerun production promotion/);
  assert.match(workflow, /GITHUB_RUN_ATTEMPT/);
  assert.match(workflow, /git ls-remote origin refs\/heads\/main/);
  assert.match(workflow, /if \[ "\$GITHUB_SHA" != "\$latest_main" \]/);
  assert.match(workflow, /exit 42/);
  assert.match(workflow, /group: ekodi-shared-site-worker-production/);
});
