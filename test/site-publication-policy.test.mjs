import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolvePublicationSiteForRequest, staticSitePublicationCatalog } from '../site-publication-runtime.js';

const read = path => readFile(new URL('../'+path, import.meta.url),'utf8');

test('site publication policy is forced, public by default, and authority-scoped', async () => {
  const policy=JSON.parse(await read('config/site-publication-policy.json'));
  assert.equal(policy.id,'EKODI-SITE-PUBLICATION-001');
  assert.equal(policy.status,'enforced');
  assert.equal(policy.autoEnrollFutureSites,true);
  assert.equal(policy.defaultStatus,'public');
  assert.deepEqual(policy.allowedStatuses,['public','private','maintenance']);
  assert.equal(policy.publicBeforeLogin,true);
  assert.equal(policy.authority.platformSuperAdmin,'all-sites');
  assert.equal(policy.authority.siteAdmin,'own-site-only');
  assert.equal(policy.authority.crossSiteSiteAdminMutation,false);
  assert.equal(policy.safety.preserveAdminAccessWhenPrivate,true);
  assert.equal(policy.safety.preserveAuthenticationWhenPrivate,true);
  assert.equal(policy.safety.preserveApiOperationsWhenPrivate,true);
  assert.match(policy.privateRobots,/noindex/);
});

test('catalog automatically covers registered public services and independent sites', () => {
  const sites=staticSitePublicationCatalog();
  const ids=new Set(sites.map(site=>site.id));
  for(const id of ['ekodi','seonammedi','pyeonggongmok','cheonggye','cgma','community','church','mission','mall']) assert.ok(ids.has(id),id);
  for(const site of sites) assert.equal(site.defaultPublicStatus,'public');
});

test('public page is governed while site admin and static assets stay reachable', async () => {
  const publicSite=await resolvePublicationSiteForRequest(new Request('https://ekodi.kr/seonammedi/'),{});
  assert.equal(publicSite?.id,'seonammedi');
  const adminPublicGuard=await resolvePublicationSiteForRequest(new Request('https://ekodi.kr/seonammedi/admin/'),{});
  assert.equal(adminPublicGuard,null);
  const adminSite=await resolvePublicationSiteForRequest(new Request('https://ekodi.kr/seonammedi/admin/'),{}, {admin:true});
  assert.equal(adminSite?.id,'seonammedi');
  const asset=await resolvePublicationSiteForRequest(new Request('https://ekodi.kr/seonammedi/app.js'),{});
  assert.equal(asset,null);
});

test('platform and site admin surfaces share one publication state source', async () => {
  const [api,router,admin]=await Promise.all([read('api-worker.js'),read('platform-router-entry-worker.js'),read('admin-public-site-controls.js')]);
  assert.match(api,/listSitePublicationSettings/);
  assert.match(api,/putSitePublicationSetting/);
  assert.match(api,/handleSitePublicationApi/);
  assert.match(api,/SITE_PUBLICATION_FORBIDDEN/);
  assert.match(api,/auth\.session\.role !== 'super_admin'/);
  assert.match(router,/sitePublicationGuard/);
  assert.match(router,/injectSitePublicationAdmin/);
  assert.match(router,/resolvePublicationSiteForRequest\(request,env,\{admin:true\}\)/);
  assert.match(admin,/<option value="private">비공개<\/option>/);
  assert.match(admin,/data-maintenance-options/);
});


test('site publication runtime remains reusable while seonammedi omits the site-local selector', async () => {
  const [runtime,adminHtml,adminCss]=await Promise.all([
    read('site-publication-runtime.js'),
    read('sites/seonammedi/public/admin/index.html'),
    read('sites/seonammedi/public/admin/admin.css'),
  ]);
  assert.match(adminHtml,/sidebar-home-row/);
  assert.match(adminHtml,/data-panel-target="dashboard"[^>]*>운영홈<\/button>/);
  assert.doesNotMatch(adminHtml,/data-ekodi-site-publication-slot|사이트 공개여부/);
  assert.match(runtime,/document\.querySelector\('\[data-ekodi-site-publication-slot\]'\)/);
  assert.match(runtime,/ekodi-site-publication-inline/);
  assert.match(runtime,/if\(!slot\)return/);
  assert.doesNotMatch(runtime,/target\.prepend\(bar\)/);
  assert.match(runtime,/if\(slot\)select\.onchange=persist/);
  assert.match(adminCss,/\.sidebar-home-row/);
});
