import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const workflow=readFileSync(new URL('../.github/workflows/verify-points-production-backup-plan.yml',import.meta.url),'utf8');
const source=readFileSync(new URL('../scripts/points-production-backup-plan.mjs',import.meta.url),'utf8');

test('backup plan workflow stays protected, manual-only and read-only',()=>{
  assert.match(workflow,/^on:\n  workflow_dispatch:/m);
  assert.doesNotMatch(workflow,/^\s{2}(?:push|pull_request|schedule):/m);
  assert.match(workflow,/^permissions:\n  contents: read$/m);
  assert.match(workflow,/^    environment: production$/m);
  assert.match(workflow,/test "\$GITHUB_REF" = 'refs\/heads\/main'/);
  assert.match(workflow,/test "\$GITHUB_SHA" = "\$EXPECTED_SHA"/);
  assert.match(workflow,/test "\$\(gh api "repos\/\$GITHUB_REPOSITORY\/git\/ref\/heads\/main"/);
  assert.match(workflow,/node scripts\/points-production-backup-plan\.mjs/);
  assert.match(workflow,/node --test test\/points-production-backup-plan\.test\.mjs/);
  assert.match(workflow,/SUPABASE_ACCESS_TOKEN=\$token/);
  assert.match(workflow,/::add-mask::\$token/);
});

test('no guarded job can change SQL, secrets, deployments, points flags or revenue',()=>{
  assert.doesNotMatch(workflow,/supabase\s+db\s+push|supabase migration up|functions deploy|database\/query(?!\/read-only)|POINTS_ENABLED\s*=\s*true|gh pr merge|supabase secrets set/i);
  assert.match(source,/method:'GET'/);
  assert.match(source,/production_schema_write_authorized:false/);
  assert.match(source,/production_points_activation_authorized:false/);
  assert.match(source,/restore_test_verified:false/);
  assert.doesNotMatch(source,/api\/v1\/projects\/.*\/database\/migrations|supabase\s+db\s+push/i);
  assert.match(workflow,/require_recent_backup:/);
});
