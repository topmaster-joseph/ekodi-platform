import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const workflow=readFileSync(new URL('../.github/workflows/stage-books-shell.yml',import.meta.url),'utf8').replace(/\r\n/g,'\n');

test('Books staging-only dispatch requires EKODI orchestrator branch and task receipt',()=>{
  assert.match(workflow,/workflow_dispatch:\n    inputs:\n      release_branch_ref:/);
  assert.match(workflow,/release_branch_ref:\n        description:[^\n]+\n        required: true/);
  assert.match(workflow,/release_task_id:\n        description:[^\n]+\n        required: true/);
  assert.match(workflow,/EKODI_RELEASE_BRANCH_REF: \$\{\{ inputs\.release_branch_ref \|\| '' \}\}/);
  assert.match(workflow,/EKODI_RELEASE_TASK_ID: \$\{\{ inputs\.release_task_id \|\| '' \}\}/);
  assert.match(workflow,/validate-ekodi-ai-change-orchestration\.mjs" --release/);
});
test('dispatch only reaches protected Development Books; never production',()=>{
  assert.match(workflow,/if: github\.event_name != 'pull_request'/);
  assert.match(workflow,/CLOUDFLARE_DEVELOPMENT_API_TOKEN/);
  assert.match(workflow,/CLOUDFLARE_ACCOUNT_ID: 46aad4738793fbaca88574832a2ccc0f/);
  assert.match(workflow,/--config wrangler\.books\.staging\.toml/);
  assert.match(workflow,/deployments list --name ekodi-publishing-staging --json/);
  assert.doesNotMatch(workflow,/CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/);
  assert.doesNotMatch(workflow,/--config wrangler\.books\.toml/);
  assert.doesNotMatch(workflow,/--config wrangler\.publishing\.toml/);
});
