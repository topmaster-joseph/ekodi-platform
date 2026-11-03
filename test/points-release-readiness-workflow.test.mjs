import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const wf=readFileSync(new URL('../.github/workflows/verify-points-release-readiness.yml',import.meta.url),'utf8');
const cli=readFileSync(new URL('../scripts/verify-points-release-readiness.mjs',import.meta.url),'utf8');

test('readiness workflow is manual-only and has no repository write permissions',()=>{
  assert.match(wf,/^on:\n  workflow_dispatch:/m);
  assert.doesNotMatch(wf,/^\s{2}(?:push|schedule|pull_request|workflow_run):/m);
  assert.match(wf,/^permissions:\n  contents: read$/m);
  assert.match(wf,/test "\$GITHUB_REF" = 'refs\/heads\/main'/);
  assert.match(wf,/environment: \$\{\{ inputs\.target \}\}/);
  assert.match(wf,/options:\n          - production\n          - development/);
});
test('never deploys schema or changes flags, credentials or economic privileges',()=>{
  assert.match(wf,/node scripts\/verify-points-release-readiness\.mjs/);
  assert.match(wf,/--report/);
  assert.match(wf,/::add-mask::\$token/);
  assert.match(wf,/SUPABASE_ACCESS_TOKEN=\$token/);
  assert.doesNotMatch(wf,/supabase db push|supabase migration|functions deploy|apply.migration|ALTER TABLE|DROP TABLE|CREATE TABLE|POINTS_ENABLED=.*true|gh pr merge/i);
  assert.doesNotMatch(cli,/fetchImpl\([^)]*\{\s*method:\s*'PUT'/);
  assert.match(cli,/database\/query\/read-only/);
  assert.match(cli,/points_activation_authorized:false/);
});
test('static validation precedes any live Management API call',()=>{
  const validate=wf.indexOf('  validate:');
  const inspect=wf.indexOf('  inspect:');
  assert.ok(validate>=0&&inspect>validate);
  assert.match(wf,/needs: validate/);
  assert.match(wf,/node --test test\/points-release-readiness\.test\.mjs/);
  assert.match(wf,/if \[ -z "\$token" \]; then echo 'Missing authorized Supabase Management API credential'; exit 2; fi/);
});
