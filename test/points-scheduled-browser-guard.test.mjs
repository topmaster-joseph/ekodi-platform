import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const workflow=readFileSync(new URL('../.github/workflows/verify-points-staging-browser.yml',import.meta.url),'utf8');

// A merge through an Actions-issued orchestrator token may not produce a push
// event. Keep an independent, bounded development browser proof on a schedule.
test('points browser E2E retains independent scheduled proof and explicit main-only execution',()=>{
  assert.match(workflow,/^on:\n  workflow_dispatch:/m);
  assert.match(workflow,/^  schedule:\n    - cron: '17 2,14 \\* \\* \\*'$/m);
  assert.match(workflow,/^  push:\n    branches: \\[main\\]/m);
  assert.match(workflow,/if: github\\.ref == 'refs\\/heads\\/main'/);
  assert.match(workflow,/concurrency:\n  group: verify-points-staging-browser\n  cancel-in-progress: false/);
});

// The scheduled proof must never acquire production credentials or use the
// production project. Always scope its synthetic identities to development.
test('points scheduled browser proof is isolated to development credentials and targets',()=>{
  assert.match(workflow,/environment: development/);
  assert.match(workflow,/DEV_REF: lxcxwbdwwojjkgybbqii/);
  assert.match(workflow,/EKODI_BROWSER_ENVIRONMENT: development/);
  assert.match(workflow,/ADMIN_STAGING: https:\\/\\/ekodi-admin-staging\\.ekodi-development\\.workers\\.dev/);
  assert.match(workflow,/MY_STAGING: https:\\/\\/ekodi-my-staging\\.ekodi-development\\.workers\\.dev/);
  assert.doesNotMatch(workflow,/renzehysxirjilvdxacv|environment: production|POINTS_ENABLED\\s*[:=]\\s*true/);
  assert.match(workflow,/permissions:\n  contents: read/);
});

// Both the synthetic fixtures and temporary Access policy must be removed
// even if the browser step fails or is cancelled.
test('points scheduled E2E preserves independent always-run cleanup',()=>{
  assert.match(workflow,/if: always\\(\\) && env\\.E2E_ACCESS_EPHEMERAL == '1'/);
  assert.match(workflow,/node scripts\\/points-staging-access\\.mjs close/);
  assert.match(workflow,/FIXTURES_CREATED=1/);
  assert.match(workflow,/POINTS_E2E_RUN: \\$\\{\\{ github\\.run_id \\}\\}/);
});
