import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../'+path, import.meta.url), 'utf8');
const OLD_HOST = ['work','ekodi','kr'].join('.');

test('Work public surface is apex-only and its Worker has no public custom domain', async () => {
  const [wrangler, manifest, routes, boundaries, constitution] = await Promise.all([
    read('wrangler.work.toml'),
    read('deploy/manifests/work.worker.json'),
    read('platform-route-registry.js'),
    read('platform-boundaries.json'),
    read('governance/constitution/constitution.json'),
  ]);

  assert.equal(wrangler.includes(OLD_HOST), false);
  assert.equal(wrangler.includes('custom_domain = true'), false);
  assert.match(wrangler, /AUTH_URL = "https:\/\/ekodi\.kr\/auth\/\?site=work"/);

  const release = JSON.parse(manifest);
  for (const request of release.worker.requests) {
    assert.ok(request.url.startsWith('https://ekodi.kr/work/'), request.url);
    assert.equal(request.url.includes(OLD_HOST), false);
  }

  assert.match(routes, /id:'work',prefix:'\/work',binding:'WORK',virtualHost:PLATFORM_CANONICAL_HOST/);
  assert.equal(routes.includes(`[platformHost('work')]:'/work'`), false);

  const architecture = JSON.parse(boundaries);
  assert.equal(architecture.platforms.work.canonicalPath, 'https://ekodi.kr/work');
  assert.equal(architecture.platforms.work.adminCanonicalPath, 'https://ekodi.kr/work/admin');
  assert.ok(architecture.platforms.work.domains.includes('ekodi.kr'));
  assert.equal(architecture.platforms.work.domains.includes(OLD_HOST), false);

  const law = JSON.parse(constitution);
  assert.equal(law.legacyDomainAllowlist.includes(OLD_HOST), false);
  assert.equal(Object.prototype.hasOwnProperty.call(law.legacyDomainTargets || {}, OLD_HOST), false);
});

test('Work user, auth and admin entry points use canonical apex paths', async () => {
  const [auth, adminRoutes, adminUi, campus, my, business, education] = await Promise.all([
    read('auth-site/client-auth.js'),
    read('admin-canonical-routes.js'),
    read('work-admin.js'),
    read('campus-actions.js'),
    read('my/app.js'),
    read('business/customer-next.js'),
    read('education/study/index.html'),
  ]);

  assert.match(auth, /work:\{name:'에코디워크 · 구인구직',returnTo:'https:\/\/ekodi\.kr\/work'/);
  assert.match(adminRoutes, /if\(normalized==='work'\)[\s\S]*const base='\/work\/admin'/);
  assert.match(adminRoutes, /parts\[0\]==='work'&&parts\[1\]==='admin'/);
  assert.match(adminUi, /const WORK_URL = 'https:\/\/ekodi\.kr\/work'/);
  assert.match(adminUi, /const AUTH_URL = 'https:\/\/ekodi\.kr\/auth\/\?site=work'/);
  assert.match(adminUi, /구인구직 운영 관리/);
  const adminRuntime = await read('admin-menu-runtime.js');
  const demandLoader = await read('admin-demand-loader.js');
  assert.match(adminRuntime, /https:\/\/ekodi\.kr\/work\/admin/);
  assert.match(demandLoader, /paths: \['\/work\/admin', '\/work\/admin\/'\]/);
  assert.match(campus, /domain: 'ekodi\.kr\/work'/);
  assert.match(my, /\['work','에코디워크 · 구인구직','https:\/\/ekodi\.kr\/work'\]/);
  assert.match(business, /https:\/\/ekodi\.kr\/work/);
  assert.match(education, /href="https:\/\/ekodi\.kr\/work"/);
});

test('Work retirement plan removes the old hostname instead of redirecting it', async () => {
  const [planText, workflow, router] = await Promise.all([
    read('config/retire-public-subdomains-wave1.json'),
    read('.github/workflows/retire-public-subdomains-wave1.yml'),
    read('platform-route-registry.js'),
  ]);
  const plan = JSON.parse(planText);
  const work = plan.targets.find(item => item.label === 'work');
  assert.ok(work);
  assert.equal(work.service, 'ekodi-work');
  assert.equal(work.apexHealth, 'https://ekodi.kr/work/');
  assert.match(workflow, /wrangler\.work\.toml/);
  assert.match(workflow, /deploy\/manifests\/work\.worker\.json/);
  assert.equal(router.includes(OLD_HOST), false);
});
