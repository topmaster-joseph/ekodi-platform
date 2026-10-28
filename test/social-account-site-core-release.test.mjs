import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const manifest = JSON.parse(read('deploy/manifests/shared-site.worker.json'));
const converge = read('scripts/converge-orchestrated-pr-merge.mjs');
const recover = read('scripts/recover-release-provenance.mjs');
const builder = read('scripts/build.mjs');

test('SOCIAL-ID-UI-002 guarded Site Core deploy includes exact live JS/CSS canaries', () => {
  assert.ok(manifest.version >= 111);
  assert.equal(manifest.worker.config, 'wrangler.site.toml');
  const checks = [
    ['https://ekodi.kr/admin/social-account-admin.js?social-id-ui=002',
      ['data-social-search', 'data-social-filter', "panel.dataset.adminListLayout='dashboard'"]],
    ['https://ekodi.kr/admin/social-account-admin.css?social-id-ui=002',
      ['SOCIAL-ID-UI-002', 'grid-template-columns:repeat(4,minmax(0,1fr))!important']]
  ];
  for (const [url, markers] of checks) {
    const canary = manifest.worker.requests.find(x => x.url === url);
    assert.ok(canary, 'missing live canary: ' + url);
    assert.deepEqual(canary.statuses, [200]);
    assert.equal(canary.redirect, 'manual');
    assert.equal(canary.rollbackVerify, false);
    for (const marker of markers) assert.ok(canary.expect.includes(marker), 'missing proof: ' + marker);
  }
});

test('manifest-only repair retains authorized protected dispatch and build inclusion', () => {
  assert.ok(builder.includes("'social-account-admin.js'"));
  assert.ok(builder.includes("'social-account-admin.css'"));
  for (const source of [converge,recover]) {
    assert.ok(source.includes("'deploy/manifests/shared-site.worker.json'"), 'guarded Site Core trigger missing');
    assert.ok(source.includes('if(sharedSiteTouched)'), 'Site Core dispatch missing');
  }
  assert.match(converge, /release receipt is not authorized/);
  assert.match(recover, /release_branch_ref:branchRef,release_task_id:taskId/);
});
