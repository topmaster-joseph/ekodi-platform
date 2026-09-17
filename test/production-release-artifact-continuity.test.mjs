import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow = fs.readFileSync('.github/workflows/deploy-site-core.yml', 'utf8');

function position(needle) {
  const index = workflow.indexOf(needle);
  assert.notEqual(index, -1, 'missing workflow contract: ' + needle);
  return index;
}

test('production release depends directly on staging and reliability gates', () => {
  assert.match(workflow, /deploy:\n    needs: \[staging_gate, reliability_gate\]/);
  assert.match(workflow, /STAGING_RELEASE_DIGEST: \$\{\{ needs\.staging_gate\.outputs\.release_digest \}\}/);
});

test('production release rebuild is reproducible and fail-closed on digest drift', () => {
  assert.match(workflow, /SOURCE_DATE_EPOCH=/);
  assert.match(workflow, /shared-site-release-artifact-production\.json/);
  assert.match(workflow, /Production release artifact diverged from staging/);
  assert.match(workflow, /test "\$actual" = "\$STAGING_RELEASE_DIGEST"/);
});

test('artifact continuity is proven before any production release mutation', () => {
  const build = position('- name: Build shared site assets');
  const continuity = position('- name: Enforce staging-to-production artifact continuity');
  const domainMutation = position('- name: Verify and repair Cloudflare custom-domain attachments');
  const release = position('- name: Candidate at 0%, verify routes, promote and auto-rollback on failure');
  assert.ok(build < continuity, 'continuity must follow the production build');
  assert.ok(continuity < domainMutation, 'continuity must precede Cloudflare domain mutation');
  assert.ok(continuity < release, 'continuity must precede guarded production promotion');
});

test('guarded release and rollback path remain mandatory', () => {
  assert.match(workflow, /scripts\/guarded-worker-release\.mjs/);
  assert.match(workflow, /Candidate at 0%, verify routes, promote and auto-rollback on failure/);
});
