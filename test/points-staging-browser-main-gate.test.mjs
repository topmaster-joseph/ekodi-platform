import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source=readFileSync(new URL('../.github/workflows/verify-points-staging-browser.yml',import.meta.url),'utf8');

test('Points E2E runs on protected main changes and never on PR branch pushes',()=>{
  assert.match(source,/on:\n  workflow_dispatch:\n[\s\S]*?  push:\n    branches: \[main\]/);
  assert.match(source,/    paths:\n[\s\S]*?'\.github\/workflows\/verify-points-staging-browser.yml'/);
  assert.match(source,/      - 'my\/points\/\*\*'/);
  assert.match(source,/  verify:\n    if: github\.ref == 'refs\/heads\/main'/);
  assert.doesNotMatch(source,/pull_request:\s/);
});

test('automatic dev browser proof is never authorized to mutate production',()=>{
  assert.match(source,/    environment: development/);
  assert.match(source,/DEV_REF: lxcxwbdwwojjkgybbqii/);
  assert.match(source,/CLOUDFLARE_ACCOUNT_ID: 46aad4738793fbaca88574832a2ccc0f/);
  assert.match(source,/MY_STAGING: https:\/\/ekodi-my-staging\.ekodi-development\.workers\.dev/);
  assert.match(source,/ADMIN_STAGING: https:\/\/ekodi-admin-staging\.ekodi-development\.workers\.dev/);
  assert.match(source,/    group: verify-points-staging-browser/);
  assert.match(source,/    cancel-in-progress: false/);
  assert.match(source,/      - name: Revoke ephemeral session, member and fixtures\n        if: always\(\)/);
  assert.match(source,/      - name: Remove ephemeral Access service token\n        if: always\(\) && env\.E2E_ACCESS_EPHEMERAL == '1'/);
  assert.doesNotMatch(source,/renzehysxirjilvdxacv|production\.supabase\.co|POINTS_ENABLED=true/);
});
