import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = async path => readFile(new URL(path, import.meta.url), 'utf8');

function workflowPaths(yaml, trigger) {
  const eventBlock = yaml.match(new RegExp('^  '+trigger+':\\s*\\n([\\s\\S]*?)(?=^  (?:workflow_dispatch|pull_request|push|schedule):|^permissions:|^concurrency:|^env:|$)', 'm'));
  assert.ok(eventBlock, 'Expected '+trigger+' event');
  return eventBlock[1];
}

test('EKODIBIZ worker changes and scoped AI-agency tests trigger release validation on PR and main', async () => {
  const workflow = await read('../.github/workflows/deploy-ekodibiz.yml');
  for (const event of ['pull_request', 'push']) {
    const paths=workflowPaths(workflow,event);
    for (const required of ['ekodibiz/**','ekodibiz-worker.js','ekodibiz-ai-agency.js','test/ekodibiz-ai-agency*.test.mjs']) {
      assert.ok(paths.includes("- '"+required+"'"), event+' must watch '+required);
    }
  }
  assert.match(workflow,/node --check ekodibiz-ai-agency\.js/);
  assert.match(workflow,/node --test test\/ekodibiz-ai-agency\*\.test\.mjs/);
  assert.match(workflow,/node --test test\/ekodibiz-agency-deploy-trigger-contract\.test\.mjs/);
  assert.match(workflow,/deploy-production:[\s\S]*guarded-worker-release\.mjs/);
  assert.doesNotMatch(workflow,/AGENCY_LIVE_ENABLED\s*=\s*true/);
});

test('shared Site Core is redeployed on exact canonical agency route ownership changes', async () => {
  const workflow=await read('../.github/workflows/deploy-site-core.yml');
  const push=workflowPaths(workflow,'push');
  assert.ok(push.includes("- 'ekodibiz-agency-route.js'"));
  assert.ok(push.includes("- 'test/ekodibiz-ai-agency-canonical-route.test.mjs'"));
  assert.match(workflow,/scripts\/guarded-worker-release\.mjs/);
});
