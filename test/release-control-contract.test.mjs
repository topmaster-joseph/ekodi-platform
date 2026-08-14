import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Deployments is bundled behind the secured admin runtime without a static menu leak', async () => {
  const [build, worker, admin, css] = await Promise.all([
    read('scripts/build.mjs'), read('site-worker.js'), read('release-control-admin.js'), read('release-control-admin.css'),
  ]);
  assert.match(build, /release-control-admin\.css/);
  assert.match(build, /release-control-admin\.js/);
  assert.doesNotMatch(build, /data-section=\"release\"/);
  assert.doesNotMatch(build, /<span>Release<\/span>/);
  assert.match(worker, /'\/release-control-admin\.js'/);
  assert.match(worker, /'\/release-control-admin\.css'/);
  assert.match(worker, /https:\/\/api\.github\.com/);
  assert.match(admin, /DEPLOYMENTS_SECTION = 'deployments'/);
  assert.match(admin, /role === 'super_admin'/);
  assert.match(admin, /section\.hidden = true/);
  assert.match(admin, /item\.dataset\.section === DEPLOYMENTS_SECTION/);
  assert.match(admin, /Deployments/);
  assert.match(css, /\.release-units/);
});

test('deployment control describes guarded release models without exposing privileged secrets', async () => {
  const admin = await read('release-control-admin.js');
  for (const workflow of ['deploy-admin-site.yml','deploy-control-api.yml','deploy-finance.yml','sync-marketing-ai.yml','deploy-community.yml','deploy-books.yml','deploy-social.yml']) {
    assert.ok(admin.includes(workflow), `missing release unit ${workflow}`);
  }
  assert.match(admin, /automaticProductionBypass:\s*false/);
  assert.match(admin, /topologyMutation:\s*'manual-only'/);
  assert.match(admin, /prepared-for-split-token/);
  assert.doesNotMatch(admin, /CLOUDFLARE_API_TOKEN|CLOUDFLARE_ACCOUNT_ID|TOSS_SECRET_KEY|GITHUB_TOKEN/);
});
