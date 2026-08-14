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

test('community admin UI is lazy-loaded and secured as an admin asset', async () => {
  const [ui, features, build, site, entry] = await Promise.all([
    read('community-reports-admin.js'),
    read('control-center-features.js'),
    read('scripts/build.mjs'),
    read('site-worker.js'),
    read('customer-entry-worker.js'),
  ]);
  for (const marker of ['Ministry Reports', 'Approve & Send', 'AI Draft', '본부 수신 이메일']) assert.ok(ui.includes(marker), `missing UI marker: ${marker}`);
  assert.ok(features.includes('loadCommunity'));
  assert.ok(features.includes("placeholder('community'"));
  assert.ok(build.includes('community-reports-admin.js'));
  assert.ok(build.includes('community-reports-admin.css'));
  assert.ok(site.includes("'/community'"));
  assert.ok(site.includes("'/community-reports-admin.js'"));
  assert.ok(entry.includes('handleCommunityReportsRequest'));
  assert.ok(entry.includes('runCommunityReportSchedule'));
});
