import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const [admin, styles] = await Promise.all([
  readFile(new URL('../social-admin.js', import.meta.url), 'utf8'),
  readFile(new URL('../social-admin.css', import.meta.url), 'utf8')
]);

test('Social Hub defaults to a status-first four-workspace layout', () => {
  assert.match(admin, /const overview = el\('div','','social-overview-metrics'\)/);
  assert.match(admin, /const tabBar=el\('div','','social-workspace-tabs'\)/);
  for (const tab of ['sites','connections','publishing','policy']) {
    assert.ok(admin.includes(`['${tab}',`),`missing workspace tab: ${tab}`);
  }
  for (const metric of ['sites','connections','publishing','attention']) {
    assert.ok(admin.includes(`['${metric}',`),`missing overview metric: ${metric}`);
  }
  assert.match(admin,/tabBar\.setAttribute\('role','tablist'\)/);
  assert.match(admin,/button\.setAttribute\('aria-selected',String\(active\)\)/);
  assert.match(admin,/panel\.hidden=!active/);
  assert.match(admin,/button\.addEventListener\('keydown'/);
});

test('Site discovery is filterable and central site selection opens the publishing workspace', () => {
  assert.match(admin,/const directorySearch = input\('', 'search', '사이트·서비스 이름으로 검색'\)/);
  assert.match(admin,/directorySearch\.addEventListener\('input'/);
  assert.match(admin,/directorySearch\.dispatchEvent\(new Event\('input'\)\)/);
  assert.match(admin,/showTab\('publishing'\)/);
  assert.match(admin,/dataset\.centralChannelSubject/);
  assert.match(admin,/canonicalServiceSocialAdminUrl/);
  // Admin lazy scripts are served under /admin/, but catalog is a root asset.
  // A relative import would request /admin/admin-service-catalog.js (HTML fallback).
  assert.match(admin, /import\('\/admin-service-catalog\.js'\)/);
  assert.doesNotMatch(admin, /import\('\.\/admin-service-catalog\.js'\)/);
});

test('Site directory hydrates on lazy mount without requiring a second nav click', () => {
  const mount = admin.indexOf("showTab(initialIntent.provider?'connections':'sites');");
  const hydrate = admin.indexOf('void renderSiteDirectory();', mount);
  const click = admin.indexOf("navButton.addEventListener('click',activate);", mount);
  assert.ok(mount >= 0 && hydrate > mount && click > hydrate,
    'read-only catalog must render when lazy Admin routing selects social without a click');
  assert.match(admin, /await Promise\.all\(\[renderSiteDirectory\(\),/);
});

test('Registry edits are isolated from connection actions and preserve revision-based save', () => {
  assert.match(admin,/const policyPanel = el\('section','','social-policy-panel'\)/);
  assert.match(admin,/policyActions\.append\(addOrg,save\)/);
  assert.match(admin,/body:JSON\.stringify\(\{registry,expectedRevision:revision\}\)/);
  assert.match(admin,/window\.addEventListener\('beforeunload'/);
  assert.match(admin,/await startConnection\(button\.dataset\.connectProvider\)/);
  assert.match(admin,/await publishingApi\(`\/v1\/channels\/\$\{encodeURIComponent\(channel\.id\)\}\/sites`/);
});

test('Social Hub layout is responsive and uses a contained workspace rather than global shell changes', () => {
  assert.match(styles,/SOCIAL-WORKSPACE-IA-20261028/);
  assert.match(styles,/#socialAdmin \[hidden\]\{display:none!important\}/);
  assert.match(styles,/\.social-workspace-tabs\{display:flex/);
  assert.match(styles,/\.social-overview-metrics\{display:grid/);
  assert.match(styles,/@media\(max-width:1100px\)/);
  assert.match(styles,/@media\(max-width:760px\)/);
  assert.match(styles,/@media\(prefers-reduced-motion:reduce\)/);
});
