import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { handleMessengerOperatorControl } from '../messenger-operator-control.js';
import workspaceEntry from '../workspace-platform-entry-worker.js';
import { drainMessengerOutbox } from '../messenger-outbox.js';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const triggerBlock=workflow=>workflow.split('\npermissions:')[0];

test('operator and workspace entry modules import without side effects',()=>{
  assert.equal(typeof handleMessengerOperatorControl,'function');
  assert.equal(typeof workspaceEntry.fetch,'function');
  assert.equal(typeof workspaceEntry.scheduled,'function');
  assert.equal(typeof drainMessengerOutbox,'function');
});

test('Conversation release is one ordered orchestrator from staging through production',async()=>{
  const workflow=await read('.github/workflows/release-messenger-investment-functional.yml');
  assert.match(workflow,/name: Release EKODI Conversation Foundation/);
  assert.match(workflow,/group: ekodi-conversation-release/);
  assert.match(workflow,/workspace-staging:/);
  assert.match(workflow,/control-staging:\n\s+needs: workspace-staging/);
  assert.match(workflow,/production-workspace:/);
  assert.match(workflow,/production-control:\n\s+needs: production-workspace/);
  assert.match(workflow,/production-ui:\n\s+needs: production-control/);
  assert.match(workflow,/Apply production migration once after both staging gates/);
  assert.match(workflow,/guarded-worker-release\.mjs --manifest deploy\/manifests\/workspace-platform\.worker\.json/);
  assert.match(workflow,/guarded-worker-release\.mjs --manifest deploy\/manifests\/control-api\.worker\.json/);
  assert.match(workflow,/guarded-worker-release\.mjs --manifest deploy\/manifests\/shared-site\.worker\.json/);
});

test('generic Control workflow no longer owns Conversation-specific release triggers',async()=>{
  const workflow=await read('.github/workflows/deploy-control-api.yml');
  const triggers=triggerBlock(workflow);
  assert.match(workflow,/group: ekodi-control-api-release/);
  assert.match(triggers,/!migrations\/\*messenger\*\.sql/);
  assert.doesNotMatch(triggers,/messenger-operator-control\.js/);
  assert.doesNotMatch(triggers,/messenger-outbox\.js/);
  assert.doesNotMatch(triggers,/messenger-channel-adapters\.js/);
  assert.doesNotMatch(triggers,/ekodi-principal\.js/);
  assert.match(workflow,/guarded-worker-release\.mjs --manifest deploy\/manifests\/control-api\.worker\.json/);
});

test('production Conversation release is main-only, recoverable and health-gated',async()=>{
  const workflow=await read('.github/workflows/release-messenger-investment-functional.yml');
  assert.match(workflow,/github\.event_name == 'push'/);
  assert.match(workflow,/github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow,/d1 time-travel info ekodi-auth/);
  assert.match(workflow,/conversationSchemaReady/);
  assert.match(workflow,/triggers deploy --config wrangler\.workspace-platform\.toml/);
  assert.match(workflow,/api\/control\/messenger\/inbox/);
  assert.match(workflow,/refreshAssistantUntilSettled/);
});

test('Conversation staging uses separate isolated Workspace and Control databases',async()=>{
  const workflow=await read('.github/workflows/release-messenger-investment-functional.yml');
  assert.match(workflow,/ekodi-workspace-staging/);
  assert.match(workflow,/ekodi-conversation-control-staging/);
  assert.match(workflow,/ALLOW_MUTATIONS = "false"/);
  assert.match(workflow,/Verify Operator authentication boundary/);
});

test('CI actionlint checks the release workflows without legacy shellcheck noise',async()=>{
  const workflow=await read('.github/workflows/ci.yml');
  assert.match(workflow,/actionlint@v1\.7\.12/);
  assert.match(workflow,/-shellcheck= -pyflakes=/);
  assert.match(workflow,/\.github\/workflows\/ci\.yml/);
  assert.match(workflow,/\.github\/workflows\/deploy-control-api\.yml/);
  assert.match(workflow,/\.github\/workflows\/release-messenger-investment-functional\.yml/);
});