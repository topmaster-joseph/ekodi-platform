import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow=readFileSync(new URL('../.github/workflows/deploy-personal-finance.yml',import.meta.url),'utf8');

test('Personal Finance production auto-promotes only after validated main staging',()=>{
  assert.match(workflow,/production:\s*[\s\S]*needs: \[validate, staging\]/);
  assert.match(workflow,/if: github\.ref == 'refs\/heads\/main' && \(github\.event_name == 'push' \|\| \(github\.event_name == 'workflow_dispatch' && inputs\.promote_production == true\)\)/);
  assert.match(workflow,/environment: production/);
});

test('Personal Finance automatic production keeps recovery and guarded release gates',()=>{
  assert.match(workflow,/Capture Personal Finance D1 recovery bookmark/);
  assert.match(workflow,/d1 time-travel info ekodi-personal-finance/);
  assert.match(workflow,/Apply isolated production migrations/);
  assert.match(workflow,/guarded-worker-release\.mjs --manifest deploy\/manifests\/personal-finance-api\.worker\.json/);
  assert.match(workflow,/Deep verify production privacy boundary/);
  assert.match(workflow,/\[ "\$auth_code" = '401' \]/);
});

test('changing the Personal Finance workflow itself triggers the guarded release lane',()=>{
  assert.match(workflow,/push:\s*[\s\S]*branches: \[main\][\s\S]*"\.github\/workflows\/deploy-personal-finance\.yml"/);
});
