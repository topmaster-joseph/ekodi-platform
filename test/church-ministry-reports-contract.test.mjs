import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('church ministry reports backend is pastor-scoped and keeps approval delivery workflow', async () => {
  const mod = await import('../church-reports-control.js');
  assert.equal(typeof mod.handleChurchReportsRequest, 'function');
  assert.equal(typeof mod.runChurchReportSchedule, 'function');
  const source = await read('church-reports-control.js');
  for (const marker of [
    '/api/church/admin/reports',
    'CHURCH_PASTOR_API',
    "table', 'church_staff'",
    "WRITE_ROLES = new Set(['senior_pastor','pastor','staff'])",
    "APPROVE_ROLES = new Set(['senior_pastor','pastor'])",
    'AI_DRAFT',
    'APPROVED',
    'gmail.googleapis.com/gmail/v1/users/me/messages/send',
    'api.openai.com/v1/responses',
  ]) assert.ok(source.includes(marker), `missing backend marker: ${marker}`);
});

test('church report migration is additive and preserves legacy report history', async () => {
  const migration = await read('migrations/0067_church_ministry_reports_move.sql');
  for (const marker of [
    'church_report_settings',
    'church_ministry_reports',
    'church_report_audit_logs',
    'report_month IN (2,4,6,8,10,12)',
    'FROM community_report_settings',
    'FROM community_ministry_reports',
    'source_snapshot_json',
    'gmail_message_id',
  ]) assert.ok(migration.includes(marker), `missing migration marker: ${marker}`);
  assert.ok(!/DROP\s+TABLE/i.test(migration), 'ownership move must not destructively drop legacy report data');
});
test('church report source evidence uses church operations and excludes pastoral-care details', async () => {
  const source = await read('church-reports-control.js');
  for (const marker of [
    "churchApi(request, 'church_services'",
    "churchApi(request, 'church_events'",
    "churchApi(request, 'church_members'",
    'careDetailsExcluded: true',
    'memberDetailsExcluded: true',
    'Member contact details and pastoral-care details are excluded',
    'Future plans must come from manual.plans',
    'church.report.sources.refresh',
  ]) assert.ok(source.includes(marker), `missing church evidence marker: ${marker}`);
  assert.ok(!source.includes('community-report-source'), 'church report runtime must not use the Community source bridge');
});

test('church report UI is mounted inside pastor admin and removed from global Admin lazy navigation', async () => {
  const [ui, page, features, build, site, audit] = await Promise.all([
    read('church-reports-admin.js'),
    read('church-pastor-admin-page.js'),
    read('admin-demand-loader.js'),
    read('scripts/build.mjs'),
    read('site-worker.js'),
    read('scripts/audit-admin-menu-services.mjs'),
  ]);
  for (const marker of ['#churchReportsRoot', '/api/church/admin/reports', '사역보고 발송 설정', '교회 원자료', 'ekodi-church-pastor-session']) {
    assert.ok(ui.includes(marker), `missing church report UI marker: ${marker}`);
  }
  for (const marker of ["['reports','사역보고']", "section==='reports'", '/church-reports-admin.js', '/church-reports-admin.css', 'https://api.ekodi.kr']) {
    assert.ok(page.includes(marker), `missing pastor admin integration marker: ${marker}`);
  }
  assert.ok(!features.includes('community-reports-admin.js'), 'global Admin must no longer lazy-load the Community report UI');
  assert.ok(!/const lazy=\[[^\]]*'community'/.test(audit), 'shared Admin audit must not require the retired Community lazy module');
  assert.ok(build.includes('church-reports-admin.js'));
  assert.ok(build.includes('church-reports-admin.css'));
  assert.ok(site.includes("'/church-reports-admin.js'"));
  assert.ok(site.includes("'/church-reports-admin.css'"));
});

test('control entry serves canonical church reports and retires the old Community route', async () => {
  const entry = await read('customer-entry-worker.js');
  for (const marker of ['handleChurchReportsRequest', 'runChurchReportSchedule', '/api/church/admin/reports', 'CHURCH_REPORTS_MOVED', 'https://ekodi.kr/ekodi-church/admin/reports']) {
    assert.ok(entry.includes(marker), `missing route marker: ${marker}`);
  }
  assert.ok(!entry.includes('handleCommunityReportsRequest'));
});

test('production manifests verify the Church report move', async () => {
  const [siteManifest, apiManifest] = await Promise.all([read('deploy/manifests/shared-site.worker.json'), read('deploy/manifests/control-api.worker.json')]);
  const site = JSON.parse(siteManifest); const api = JSON.parse(apiManifest);
  const church = site.worker.requests.find(item => item.url === 'https://ekodi.kr/ekodi-church/admin');
  assert.ok(church?.expect?.includes('church-reports-admin.js'));
  assert.ok(api.worker.requests.some(item => item.url === 'https://api.ekodi.kr/api/church/admin/reports' && item.statuses.includes(401)));
  assert.ok(api.worker.requests.some(item => item.url === 'https://api.ekodi.kr/api/community/admin/reports' && item.statuses.includes(410)));
});
