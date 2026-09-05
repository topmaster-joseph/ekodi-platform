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

test('Conversation release owns only Conversation APIs, never the shared-site Worker',async()=>{
  const workflow=await read('.github/workflows/release-messenger-investment-functional.yml');
  assert.match(workflow,/name: Release EKODI Conversation Foundation APIs/);
  assert.match(workflow,/group: ekodi-conversation-release/);
  assert.match(workflow,/workspace-staging:/);
  assert.match(workflow,/control-staging:\r?\n\s+needs: workspace-staging/);
  assert.match(workflow,/production-workspace:\r?\n\s+needs: control-staging/);
  assert.match(workflow,/production-control:\r?\n\s+needs: production-workspace/);
  assert.match(workflow,/guarded-worker-release\.mjs --manifest deploy\/manifests\/workspace-platform\.worker\.json/);
  assert.match(workflow,/guarded-worker-release\.mjs --manifest deploy\/manifests\/control-api\.worker\.json/);
  assert.doesNotMatch(workflow,/guarded-worker-release\.mjs --manifest deploy\/manifests\/shared-site\.worker\.json/);
  assert.doesNotMatch(workflow,/gh workflow run deploy-site-core\.yml/);
});

test('canonical Shared Site workflow owns the shared-site manifest',async()=>{
  const workflow=await read('.github/workflows/deploy-site-core.yml');
  assert.match(workflow,/name: Deploy EKODI Shared Site Core/);
  assert.match(workflow,/group: ekodi-shared-site-worker-production/);
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

test('production Conversation API release is main-only, recoverable and health-gated',async()=>{
  const workflow=await read('.github/workflows/release-messenger-investment-functional.yml');
  assert.match(workflow,/github\.event_name == 'push'/);
  assert.match(workflow,/github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow,/d1 time-travel info ekodi-auth/);
  assert.match(workflow,/conversationSchemaReady/);
  assert.match(workflow,/api\/control\/messenger\/inbox/);
  assert.match(workflow,/Apply production migration once after both staging gates/);
});

test('Outbox recovery reuses existing Control cron and opportunistic Messenger traffic',async()=>{
  const [workspaceConfig,controlConfig,entry,controlEntry]=await Promise.all([
    read('wrangler.workspace-platform.toml'),
    read('wrangler.api.toml'),
    read('workspace-platform-entry-worker.js'),
    read('mission-control-entry-worker.js')
  ]);
  assert.doesNotMatch(workspaceConfig,/\[triggers\]/);
  assert.match(controlConfig,/crons = \["\*\/10 \* \* \* \*"\]/);
  assert.match(entry,/scheduleOutboxRecovery/);
  assert.match(entry,/url\.pathname\.startsWith\('\/v1\/messenger\/'\)/);
  assert.match(controlEntry,/drainMessengerOutbox/);
  assert.match(controlEntry,/Messenger outbox schedule error/);
  assert.match(controlEntry,/handleMessengerOperatorControl\(request, env, ctx\)/);
});

test('Conversation staging uses separate isolated Workspace and Control databases',async()=>{
  const workflow=await read('.github/workflows/release-messenger-investment-functional.yml');
  assert.match(workflow,/ekodi-workspace-staging/);
  assert.match(workflow,/ekodi-conversation-control-staging/);
  assert.match(workflow,/ALLOW_MUTATIONS = "false"/);
  assert.match(workflow,/Verify Operator authentication boundary/);
});

test('CI actionlint checks release workflows without legacy shellcheck noise',async()=>{
  const workflow=await read('.github/workflows/ci.yml');
  assert.match(workflow,/actionlint@v1\.7\.12/);
  assert.match(workflow,/-shellcheck= -pyflakes=/);
  assert.match(workflow,/\.github\/workflows\/ci\.yml/);
  assert.match(workflow,/\.github\/workflows\/deploy-control-api\.yml/);
  assert.match(workflow,/\.github\/workflows\/release-messenger-investment-functional\.yml/);
});

test('CI actionlint covers the central Core Control redispatch workflow',async()=>{
  const workflow=await read('.github/workflows/ci.yml');
  assert.match(workflow,/\.github\/workflows\/redeploy-control-on-central-core\.yml/);
});

test('central Core redispatch suppresses a duplicate native Control push run for the same SHA',async()=>{
  const workflow=await read('.github/workflows/redeploy-control-on-central-core.yml');
  assert.match(workflow,/event=push/);
  assert.match(workflow,/--arg sha "\$GITHUB_SHA"/);
  assert.match(workflow,/\.head_sha == \$sha/);
  assert.match(workflow,/native_control_run=true/);
  assert.match(workflow,/steps\.dedupe\.outputs\.native_control_run != 'true'/);
  assert.match(workflow,/github\.event_name == 'workflow_dispatch'/);
  assert.match(workflow,/gh workflow run deploy-control-api\.yml --ref main/);
});


test('Conversation staging writes temporary Wrangler configs inside the checked-out repository',async()=>{
  const workflow=await read('.github/workflows/release-messenger-investment-functional.yml');
  assert.match(workflow,/cat > \.workspace-staging\.toml/);
  assert.match(workflow,/--config \.workspace-staging\.toml/);
  assert.match(workflow,/cat > \.control-staging\.toml/);
  assert.match(workflow,/--config \.control-staging\.toml/);
  assert.doesNotMatch(workflow,/\/tmp\/(?:workspace|control)-staging\.toml/);
  assert.match(workflow,/main = "workspace-platform-entry-worker\.js"[\s\S]*migrations_dir = "migrations"/);
});


test('Access-protected Conversation staging keeps runtime verification fail-closed',async()=>{
  const workflow=await read('.github/workflows/release-messenger-investment-functional.yml');
  assert.match(workflow,/Cloudflare Access\|Log in to All Workers/);
  assert.match(workflow,/deployments status --config \.workspace-staging\.toml/);
  assert.match(workflow,/d1 execute DB --remote --config \.workspace-staging\.toml --file \/tmp\/workspace-schema-probe\.sql/);
  for(const table of ['messenger_outbox','messenger_identity_audit','ekodi_profiles','ekodi_profile_evidence','ekodi_profile_confirmations','ekodi_profile_discovery_runs','site_design_profiles']) assert.match(workflow,new RegExp(`SELECT 1 FROM ${table} LIMIT 0`));
  assert.match(workflow,/deployments status --config \.control-staging\.toml/);
  assert.match(workflow,/d1 execute DB --remote --config \.control-staging\.toml --file \/tmp\/control-schema-probe\.sql/);
  for(const table of ['messenger_threads','messenger_messages','messenger_handoffs','messenger_outbox']) assert.match(workflow,new RegExp(`SELECT 1 FROM ${table} LIMIT 0`));
  assert.match(workflow,/Production still enforces the live 401 boundary/);
});
