import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const wf=readFileSync(new URL('../.github/workflows/verify-points-staging-browser.yml',import.meta.url),'utf8');

test('development E2E schedules a protected fallback when bot merges suppress push events',()=>{
  assert.match(wf,/on:\n  workflow_dispatch:\n[\s\S]*?  schedule:\n    - cron: '17 2,14 \* \* \*'/);
  assert.match(wf,/  push:\n    branches: \[main\]/);
  assert.match(wf,/    if: github\.ref == 'refs\/heads\/main'/);
  assert.match(wf,/    environment: development/);
  assert.match(wf,/      DEV_REF: lxcxwbdwwojjkgybbqii/);
  assert.match(wf,/      EKODI_BROWSER_ENVIRONMENT: development/);
  assert.match(wf,/    cancel-in-progress: false/);
});
test('scheduled E2E retains real mobile/desktop proof and always cleans up',()=>{
  assert.match(wf,/verify-points-staging-browser\.mjs/);
  assert.match(wf,/Revoke ephemeral session, member and fixtures/);
  assert.match(wf,/      - name: Remove ephemeral Access service token/);
  assert.match(wf,/  workflow_dispatch:/);
  assert.doesNotMatch(wf,/renzehysxirjilvdxacv|production\.supabase\.co|POINTS_ENABLED=true/);
});
