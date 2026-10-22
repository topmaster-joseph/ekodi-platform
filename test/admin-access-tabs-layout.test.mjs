import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const runtime = () => readFile(new URL('../admin-menu-runtime.js', import.meta.url), 'utf8');

test('admin central view has three accessible tabs and keeps existing privileged forms', async () => {
  const code = await runtime();
  for (const id of ['overview','platform','space']) {
    assert.ok(code.includes('data-admin-access-tab=\\"' + id + '\\"'), 'tab ' + id);
    assert.ok(code.includes('data-admin-access-view=\\"' + id + '\\"'), 'view ' + id);
  }
  for (const attr of ['role=\\"tablist\\"','role=\\"tabpanel\\"','aria-controls','aria-labelledby','data-admin-form','data-space-admin-form','data-admin-list','data-space-admin-list','data-space-admin-overview-list']) {
    assert.ok(code.includes(attr), attr);
  }
  assert.match(code, /ADMIN_ACCESS_VIEWS = Object\.freeze\(\['overview', 'platform', 'space'\]\)/);
  assert.match(code, /section\.querySelector\('\[data-space-admin-overview-search\]'\)\.addEventListener\('input', renderSpaceAdminOverview\)/);
});

test('tab switching preserves URL and keyboard accessibility without changing platform authorization', async () => {
  const code = await runtime();
  assert.match(code, /new URL\(location\.href\)\.searchParams\.get\('admin_tab'\)/);
  assert.match(code, /next\.searchParams\.set\('admin_tab', active\)/);
  assert.match(code, /history\.replaceState\(history\.state/);
  assert.match(code, /event\.key === 'ArrowRight'/);
  assert.match(code, /event\.key === 'ArrowLeft'/);
  assert.match(code, /event\.key === 'Home'/);
  assert.match(code, /event\.key === 'End'/);
  assert.match(code, /tab\.setAttribute\('aria-selected'/);
  assert.match(code, /view\.hidden = view\.dataset\.adminAccessView !== active/);
  assert.match(code, /session\?\.role !== 'super_admin'/);
  assert.match(code, /currentContext\.type !== 'platform'/);
  assert.match(code, /withPrivilege\(\(\) => api\('\/api\/admin-access\/google-accounts'/);
});

test('dashboard counters derive from existing authorized API payloads, not fixed figures', async () => {
  const code = await runtime();
  for (const metric of ['sites','platform','space','private']) {
    assert.ok(code.includes('data-admin-metric=\\"' + metric + '\\"'), metric);
    assert.ok(code.includes("setAdminMetric('" + metric + "'"), metric + ' update');
  }
  assert.match(code, /setAdminMetric\('sites', tenants\.length\)/);
  assert.match(code, /setAdminMetric\('space', members\.length\)/);
  assert.match(code, /setAdminMetric\('private', members\.filter\(member=>member\.visibility!=='public'\)\.length\)/);
  assert.match(code, /setAdminMetric\('platform', accounts\.length\)/);
  assert.match(code, /SPACE_ADMIN_OVERVIEW_ROLE_SET\.has\(member\.role\)/);
  assert.match(code, /String\(value\|\|''\)\.toLocaleLowerCase\(\)\.includes\(search\)/);
  assert.match(code, /select\.value=slug;selectAdminAccessTab\('space'\)/);
  assert.ok(code.includes('등록된 사이트·공간이 없습니다.'));
});

test('tabbed center is responsive, and the backend roles and routes are unchanged', async () => {
  const code = await runtime();
  assert.match(code, /@media\(max-width:600px\)/);
  assert.match(code, /@media\(max-width:860px\)/);
  assert.match(code, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(code, /\/api\/customers\/tenants\/'\+encodeURIComponent\(tenant\)\+'\/access\/update/);
  assert.match(code, /\/api\/customers\/tenants\/'\+encodeURIComponent\(tenant\)\+'\/pre-register/);
  assert.match(code, /\/api\/admin-access\/google-accounts/);
});