import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { handleMessengerOperatorControl } from '../messenger-operator-control.js';
import workspaceEntry from '../workspace-platform-entry-worker.js';
import { drainMessengerOutbox } from '../messenger-outbox.js';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('operator and workspace entry modules import without side effects',()=>{
  assert.equal(typeof handleMessengerOperatorControl,'function');
  assert.equal(typeof workspaceEntry.fetch,'function');
  assert.equal(typeof workspaceEntry.scheduled,'function');
  assert.equal(typeof drainMessengerOutbox,'function');
});

test('Control and Workspace releases share one global serialization lane',async()=>{
  const [control,workspace]=await Promise.all([
    read('.github/workflows/deploy-control-api.yml'),
    read('.github/workflows/release-messenger-investment-functional.yml')
  ]);
  const lane='group: ekodi-shared-d1-worker-release';
  assert.ok(control.includes(lane));
  assert.ok(workspace.includes(lane));
  assert.match(control,/cancel-in-progress: false/);
  assert.match(workspace,/cancel-in-progress: false/);
  assert.match(control,/messenger-operator-control\.js/);
  assert.match(workspace,/workspace-platform-entry-worker\.js/);
});

test('production Workspace release is gated on main and guarded promotion',async()=>{
  const workflow=await read('.github/workflows/release-messenger-investment-functional.yml');
  assert.match(workflow,/github\.event_name == 'push'/);
  assert.match(workflow,/github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow,/guarded-worker-release\.mjs --manifest deploy\/manifests\/workspace-platform\.worker\.json/);
  assert.match(workflow,/conversationSchemaReady/);
  assert.match(workflow,/triggers deploy --config wrangler\.workspace-platform\.toml/);
});

test('production Control release remains staged, guarded and recoverable',async()=>{
  const workflow=await read('.github/workflows/deploy-control-api.yml');
  assert.match(workflow,/d1 time-travel info ekodi-auth/);
  assert.match(workflow,/apply-d1-migrations-with-retry\.sh ekodi-auth wrangler\.api\.toml/);
  assert.match(workflow,/guarded-worker-release\.mjs --manifest deploy\/manifests\/control-api\.worker\.json/);
  assert.match(workflow,/api\/control\/messenger\/inbox/);
});