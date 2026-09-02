import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CHANNEL_AUTOMATION_TEMPLATES, channelAutomationEntitlement, templateForOwner } from '../channel-automation-policy.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('membership tiers expose bounded channel automation capabilities', () => {
  const free=channelAutomationEntitlement('free');
  assert.equal(free.plan,'free'); assert.equal(free.maxChannels,0); assert.equal(free.manualExport,true); assert.equal(free.immediate,false); assert.equal(free.autonomous,false);
  assert.equal(channelAutomationEntitlement('flex').maxChannels, 1);
  assert.equal(channelAutomationEntitlement('plus').maxChannels, 3);
  assert.equal(channelAutomationEntitlement('plus').scheduled, true);
  assert.equal(channelAutomationEntitlement('pro').maxChannels, 5);
  assert.equal(channelAutomationEntitlement('pro').repeating, true);
  assert.equal(channelAutomationEntitlement('auto').maxChannels, 10);
  assert.equal(channelAutomationEntitlement('auto').autonomous, true);
});

test('templates stay provider-neutral while devotional daily is workspace-specialized', () => {
  assert.ok(CHANNEL_AUTOMATION_TEMPLATES.some(x => x.id === 'shorts_general'));
  assert.ok(templateForOwner('devotional_daily','workspace'));
  assert.equal(templateForOwner('devotional_daily','person'), null);
  assert.ok(templateForOwner('daily_tip','person'));
});
test('OAuth credentials are encrypted and owned by person or immutable workspace', async () => {
  const [migration,vault,oauth,subject] = await Promise.all([
    read('migrations/0055_channel_automation_core.sql'), read('channel-credential-vault.js'),
    read('channel-oauth-control.js'), read('channel-automation-subject.js'),
  ]);
  assert.match(migration, /owner_type TEXT NOT NULL CHECK\(owner_type IN \('person','workspace'\)\)/);
  assert.match(migration, /credential_ciphertext TEXT NOT NULL/);
  assert.doesNotMatch(migration, /refresh_token\s+TEXT/i);
  assert.match(vault, /AES-GCM/);
  assert.match(vault, /CHANNEL_CREDENTIAL_KEY/);
  assert.match(oauth, /channelStateHash/);
  assert.match(oauth, /DELETE FROM channel_oauth_states/);
  assert.match(oauth, /YOUTUBE_REFRESH_TOKEN_MISSING/);
  assert.match(subject, /ownerKey:context\.workspaceId/);
});

test('YouTube adapter uses OAuth, channel discovery and resumable upload', async () => {
  const adapter = await read('channel-youtube-adapter.js');
  assert.match(adapter, /youtube\.upload/);
  assert.match(adapter, /youtube\.readonly/);
  assert.match(adapter, /access_type.*offline/);
  assert.match(adapter, /uploadType=resumable/);
  assert.match(adapter, /channels\?part=id,snippet&mine=true/);
  assert.match(adapter, /uploadType=resumable&part=snippet,status/);
});
test('My EKODI and workspace admin expose separate channel automation entry points', async () => {
  const [myHtml,myApp,myChannel,workspace,worker] = await Promise.all([
    read('my/index.html'), read('my/app.js'), read('my/channel-automation.js'),
    read('workspace-admin-page.js'), read('marketing-publishing-worker.js'),
  ]);
  assert.match(myHtml, /channel-automation\.js\?v=20260903-channel-automation-1/);
  assert.match(myApp, /window\.EKODI_MY_AUTH/);
  const myWorker=await read('my-worker.js'); assert.match(myWorker, /marketing-publish-api\.ekodi\.kr/);
  assert.match(myChannel, /subject_type=person/);
  assert.match(workspace, /\['publishing','쇼츠 자동화'\]/);
  assert.match(workspace, /subject_type=workspace/);
  assert.match(workspace, /marketing-publish-api\.ekodi\.kr/);
  assert.match(worker, /channelAutomationCore:automationReady/);
  assert.match(worker, /CHANNEL_PLAN_LIMIT_REACHED/);
  assert.match(worker, /CHANNEL_PLAN_AI_AUTOMATION_REQUIRED/);
});
test('deployment gates include the channel core migration and production health contract', async () => {
  const [workflow,manifest,boundaries] = await Promise.all([
    read('.github/workflows/deploy-marketing-publishing.yml'),
    read('deploy/manifests/marketing-publishing.worker.json'), read('platform-boundaries.json'),
  ]);
  assert.match(workflow, /migrations\/0055_channel_automation_core\.sql/);
  assert.match(workflow, /test\/channel-automation-core\.test\.mjs/);
  assert.match(workflow, /channel_automation_profiles/);
  assert.match(workflow, /channel_oauth_connections/);
  assert.match(manifest, /channelAutomationCore/);
  assert.match(boundaries, /channel-credential-vault\.js/);
  assert.match(boundaries, /channel-youtube-adapter\.js/);
});