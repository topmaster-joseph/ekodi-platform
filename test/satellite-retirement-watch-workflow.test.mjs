import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const workflow = readFileSync(new URL('../.github/workflows/satellite-retirement-readonly-audit.yml',import.meta.url),'utf8');

test('fleet watch runs only on protected main, daily and optional manual invocation',()=>{
  assert.match(workflow,/\bon:\n  workflow_dispatch:\n  schedule:\n    - cron: '\d+ \d+ \* \* \*'/);
  assert.match(workflow,/if: github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow,/branches: \[main\]/);
});

test('fleet watch is least privilege and has no production secrets or mutators',()=>{
  assert.match(workflow,/permissions:\n  contents: read/);
  assert.match(workflow,/persist-credentials: false/);
  assert.doesNotMatch(workflow,/secrets\.|wrangler(?:@|\s)|gh repo delete|gh api -X DELETE|repository_dispatch|contents: write|GITHUB_TOKEN|pull-requests: write/);
  assert.doesNotMatch(workflow,/run:\s*\|[^]*?(?:git push|npm run deploy|npx wrangler)/);
});

test('fleet watch actually tests both audits and stores evidence instead of claiming deletion',()=>{
  assert.match(workflow,/node --test \\\n\s*test\/satellite-retirement-watch-report\.test\.mjs/);
  assert.match(workflow,/node scripts\/inspect-satellite-repository-retirement\.mjs/);
  assert.match(workflow,/node scripts\/audit-satellite-live-source-markers\.mjs/);
  assert.match(workflow,/node scripts\/audit-fleet-source-release-topology\.mjs/);
  assert.match(workflow,/node scripts\/build-satellite-retirement-watch-report\.mjs/);
  assert.match(workflow,/actions\/upload-artifact@v4/);
  assert.match(workflow,/GITHUB_STEP_SUMMARY/);
});
