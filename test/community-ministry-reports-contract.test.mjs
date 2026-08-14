import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('community ministry reports backend parses and exposes approval workflow', async () => {
  const mod = await import('../community-reports-control.js');
  assert.equal(typeof mod.handleCommunityReportsRequest, 'function');
  assert.equal(typeof mod.runCommunityReportSchedule, 'function');
  const source = await read('community-reports-control.js');
  for (const marker of [
    '/api/community/admin/reports',
    'AI_DRAFT',
    'APPROVED',
    'gmail.googleapis.com/gmail/v1/users/me/messages/send',
    'api.openai.com/v1/responses',
    'runCommunityReportSchedule',
  ]) assert.ok(source.includes(marker), `missing backend marker: ${marker}`);
});

test('community report schema preserves bi-monthly cadence and delivery archive', async () => {
  const migration = await read('migrations/0013_community_ministry_reports.sql');
  for (const marker of [
    'community_report_settings',
    'community_ministry_reports',
    'report_month IN (2,4,6,8,10,12)',
    'gmail_message_id',
    'approved_at',
    'sent_at',
  ]) assert.ok(migration.includes(marker), `missing migration marker: ${marker}`);
});

test('community report source snapshot migration is additive and auditable', async () => {
  const migration = await read('migrations/0015_community_report_sources.sql');
  for (const marker of [
    'source_snapshot_json',
    'source_refreshed_at',
    'source_status',
    'source_count',
    'source_error',
    'idx_community_reports_source_status',
  ]) assert.ok(migration.includes(marker), `missing source migration marker: ${marker}`);
});

test('community report source bridge is read-only, admin-gated and privacy-minimized', async () => {
  const source = await read('supabase/functions/community-report-source/index.ts');
  for (const marker of [
    'https://api.ekodi.kr/api/session',
    'verifyEkodiAdmin',
    'community_activity',
    'community_circles',
    'community_circle_members',
    'community_profiles',
    'userIdsIncluded: false',
    'memberNamesIncluded: false',
    'rawProfilesIncluded: false',
  ]) assert.ok(source.includes(marker), `missing source bridge marker: ${marker}`);
  assert.ok(source.includes('req.method !== "GET"'), 'source bridge must remain GET-only');
  assert.ok(!source.includes('select("actor_user_id'), 'source bridge must not select activity actor identities');
  assert.ok(!source.includes('select("circle_id,user_id'), 'source bridge must not select membership user identities');
});

test('AI drafting syncs recorded Community evidence and does not infer future plans', async () => {
  const source = await read('community-reports-control.js');
  for (const marker of [
    'sourcesMatch',
    "action === 'refresh'",
    'collectCommunitySources',
    'syncSources(request, env, sessionData, id)',
    'recordedSources',
    'ongoingCircles are recurring-schedule context only',
    'Future plans must come from manual.plans',
    'community.report.sources.refresh',
  ]) assert.ok(source.includes(marker), `missing source/AI marker: ${marker}`);
  const generateIndex = source.indexOf('async function generateDraft');
  const syncIndex = source.indexOf('syncSources(request, env, sessionData, id)', generateIndex);
  const aiIndex = source.indexOf('generateWithOpenAI(env, report)', generateIndex);
  assert.ok(generateIndex >= 0 && syncIndex > generateIndex && aiIndex > syncIndex, 'generate must attempt source sync before AI drafting');
});

test('community admin UI is lazy-loaded, source-aware and secured as an admin asset', async () => {
  const [ui, features, build, site, entry] = await Promise.all([
    read('community-reports-admin.js'),
    read('control-center-features.js'),
    read('scripts/build.mjs'),
    read('site-worker.js'),
    read('customer-entry-worker.js'),
  ]);
  for (const marker of ['Ministry Reports', 'Approve & Send', 'Sync + AI Draft', 'Sync Sources', 'Community Source Evidence', '/sources/refresh', '본부 수신 이메일']) {
    assert.ok(ui.includes(marker), `missing UI marker: ${marker}`);
  }
  assert.ok(features.includes('loadCommunity'));
  assert.ok(features.includes("placeholder('community'"));
  assert.ok(build.includes('community-reports-admin.js'));
  assert.ok(build.includes('community-reports-admin.css'));
  assert.ok(site.includes("'/community'"));
  assert.ok(site.includes("'/community-reports-admin.js'"));
  assert.ok(entry.includes('handleCommunityReportsRequest'));
  assert.ok(entry.includes('runCommunityReportSchedule'));
});
