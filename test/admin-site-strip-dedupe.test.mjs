import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { SITE_ADMIN_FRAME_ROOT } from '../platform-security-policy.js';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

// Observed 2026-10-27 on /admin/sites/sites-worklife: '마이 에코디' appeared twice in the
// site strip (static my.ekodi.kr row + registry ekodi.kr/my), and 에코디 워크 had no
// admin root although /work/admin exists.
test('registry reconciliation matches a site by domain, canonical apex path, then name', async () => {
  const campus = await read('campus-actions.js');
  const block = campus.slice(campus.indexOf('function reconcileRegistryServices('), campus.indexOf('refreshCampusCounts();', campus.indexOf('function reconcileRegistryServices(')));
  assert.match(block, /rows\.find\(row => normalizeDomain\(row\.dataset\.siteDomain\) === domain\)\n\s+\|\| rows\.find\(row => key && surfaceKey\(\{ domain: row\.dataset\.siteDomain \}\) === key\)\n\s+\|\| \(name \? rows\.find/);
});

test('legacy subdomains resolve to the same canonical apex path as registry entries', async () => {
  const source = await read('admin-surface-labels.js');
  const window = {};
  vm.runInNewContext(source, { window, URL });
  const key = value => new URL(window.EKODIAdminSurfaceLabels.info(value).url).pathname.replace(/\/+$/, '');
  assert.equal(key('my.ekodi.kr'), key('ekodi.kr/my'));
  assert.equal(key('mail.ekodi.kr'), '/mail');
  assert.equal(key('live.ekodi.kr'), '/live');
});

test('work, mail and live open their own admin roots below the strip', async () => {
  const [campus, hierarchy] = await Promise.all([read('campus-actions.js'), read('config/admin-site-hierarchy.json').then(JSON.parse)]);
  for (const id of ['work', 'mail', 'live']) {
    assert.match(campus, new RegExp(`\\{ id: '${id}', publicPath: '/${id}', adminPath: '/${id}/admin', siteType: 'org' \\}`));
    assert.ok(hierarchy.sites.some(site => site.id === id && site.adminPath === `/${id}/admin` && site.parentId === 'platform'), id);
    assert.ok(SITE_ADMIN_FRAME_ROOT.test(`/${id}/admin`), id);
  }
  assert.match(campus, /그 사이트의 관리자 화면이 여기에 열립니다/);
});
