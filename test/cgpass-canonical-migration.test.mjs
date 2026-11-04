import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { regionalCommerceProgramById, regionalCommerceProgramFromPath, legacyCheonggyePassCanonicalPath } from '../regional-commerce-program-registry.js';
import { staticSitePublicationCatalog, registeredTenantPath } from '../site-publication-runtime.js';
import { isPublicDiscoveryPath } from '../public-discovery-registry.js';
import { DISCOVERY_PUBLIC_ROUTES } from '../discovery-layer.js';
import { regionalAccessScopeSnapshot } from '../regional-access-control.js';
import { localRegionBySlug } from '../local-region-registry.js';
import { regionalCommerceProgramPublicPage, regionalCommerceProgramAdminPage } from '../regional-commerce-program-page.js';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('cgpass is the unique canonical route with an unchanged internal program identity',()=>{
  const program=regionalCommerceProgramById('cheonggye-pass');
  assert.equal(program.id,'cheonggye-pass');
  assert.equal(program.publicPath,'/cgpass');
  assert.equal(program.adminPath,'/cgpass/admin');
  assert.equal(regionalCommerceProgramFromPath('/cgpass').admin,false);
  assert.equal(regionalCommerceProgramFromPath('/cgpass/').admin,false);
  assert.equal(regionalCommerceProgramFromPath('/cgpass/admin').admin,true);
  assert.equal(regionalCommerceProgramFromPath('/cgpass/admin/').admin,true);
  assert.equal(regionalCommerceProgramFromPath('/cgpass/admin/vendors').admin,true);
  for(const path of ['/cgpass-other','/cgpasses','/cheonggyepass','/cheonggye/pass','/api/cheonggyepass/vendor-intake']){
    assert.equal(regionalCommerceProgramFromPath(path),null,path);
  }
});

test('legacy public and admin aliases point to cgpass, never touch vendor APIs or neighbors',()=>{
  const cases={
    '/cheonggyepass':'/cgpass',
    '/cheonggyepass/':'/cgpass',
    '/cheonggyepass/admin':'/cgpass/admin',
    '/cheonggyepass/admin/':'/cgpass/admin',
    '/cheonggyepass/admin/logs':'/cgpass/admin/logs',
    '/cheonggye/pass':'/cgpass',
    '/cheonggye/pass/':'/cgpass',
    '/cheonggye/admin/pass':'/cgpass/admin',
    '/cheonggye/admin/pass/access':'/cgpass/admin/access',
  };
  for(const [oldPath,newPath] of Object.entries(cases)){
    assert.equal(legacyCheonggyePassCanonicalPath(oldPath),newPath,oldPath);
  }
  for(const other of ['/cgpass','/cgpass/admin','/cheonggye/passive','/cheonggyepassion','/api/cheonggyepass/vendor-intake','/cgma']){
    assert.equal(legacyCheonggyePassCanonicalPath(other),'',other);
  }
  const router=read('platform-router-entry-worker.js');
  assert.match(router,/legacyCheonggyePassCanonicalPath\(url\.pathname\)/);
  assert.ok(router.indexOf('legacyCheonggyePassCanonicalPath(url.pathname)') < router.indexOf('regionalCommerceProgramFromPath(url.pathname)'));
  assert.match(router,/const target=new URL\(request\.url\);target\.pathname=canonicalPass/);
  assert.match(router,/['"]x-ekodi-route['"]:'cgpass-legacy-handoff'/);
  assert.match(router,/status:308/);
});

test('existing site/grant identity is preserved while publishing only the new canonical path',()=>{
  const sites=staticSitePublicationCatalog().filter(x=>x.id==='cheonggye-pass');
  assert.equal(sites.length,1);
  assert.equal(sites[0].canonicalPath,'/cgpass');
  assert.equal(sites[0].workspaceId,'cheonggye-pass');
  assert.equal(sites[0].authoritySiteKey,'cheonggye-pass');
  assert.equal(registeredTenantPath('cheonggye-pass','ekodi.kr/cheonggye/pass'),'/cgpass');
  assert.equal(registeredTenantPath('cheonggye-local','ekodi.kr/cheonggye'),'/cheonggye');
  assert.equal(isPublicDiscoveryPath('/cgpass'),true);
  // No legacy alias is advertised as a canonical discovery route.
  for(const oldPath of ['/cheonggye/pass','/cheonggyepass']){
    assert.equal(DISCOVERY_PUBLIC_ROUTES.some(route=>route.path===oldPath),false);
  }
  assert.equal(isPublicDiscoveryPath('/cgma'),true);
  const scopes=regionalAccessScopeSnapshot();
  const pass=scopes.find(x=>x.slug==='cheonggye-pass');
  assert.equal(pass.adminPath,'/cgpass/admin');
  assert.equal(pass.publicPath,'/cgpass');
  assert.equal(scopes.find(x=>x.slug==='cheonggye-local').publicPath,'/cheonggye');
  assert.match(read('wrangler.site.toml'),/"\/cg\*"/);
  const matches=path=>path.startsWith('/cg');
  assert.equal(matches('/cgpass'),true);
  assert.equal(matches('/cgma'),true);
  assert.match(read('customer-google-prereg.js'),/slug: 'cheonggye-pass'.*domain: 'ekodi.kr\/cgpass'/);
});

test('canonical page and guarded admin preserve existing programs, access script and internal intake API',async()=>{
  const region=localRegionBySlug('cheonggye'), program=regionalCommerceProgramById('cheonggye-pass');
  const publicHtml=await regionalCommerceProgramPublicPage(region,program).text();
  const adminHtml=await regionalCommerceProgramAdminPage(region,program).text();
  assert.match(publicHtml,/<link rel="canonical" href="https:\/\/ekodi\.kr\/cgpass">/);
  assert.match(publicHtml,/href="\/cgpass" aria-current="page"/);
  assert.match(adminHtml,/href="\/cgpass\/admin" aria-current="page"/);
  assert.match(adminHtml,/data-region-auth-pending="1"/);
  assert.match(adminHtml,/<meta name="robots" content="noindex,nofollow,noarchive">/);
  assert.equal(regionalCommerceProgramAdminPage(region,program).headers.get('x-robots-tag'),'noindex, nofollow, noarchive');
  assert.match(adminHtml,/local-region-admin-auth\.js/);
  assert.match(adminHtml,/cheonggyepass-vendor-intake-ui\.js/);
  assert.match(read('local-region-admin-auth.js'),/path==='\/cgpass\/admin'/);
  assert.match(read('cheonggyepass-vendor-intake.js'),/const BASE='\/api\/cheonggyepass\/vendor-intake'/);
});

test('protected release probes require new canonical content and old 308 locations',()=>{
  const manifest=JSON.parse(read('deploy/manifests/shared-site.worker.json'));
  const byUrl=new Map(manifest.worker.requests.map(p=>[p.url,p]));
  for(const [path,expected,route] of [
    ['/cgpass',200,'regional-commerce-program-public'],
    ['/cgpass/admin',200,'regional-commerce-program-admin'],
    ['/cheonggyepass',308,'cgpass-legacy-handoff'],
    ['/cheonggyepass/admin',308,'cgpass-legacy-handoff'],
    ['/cheonggye/pass',308,'cgpass-legacy-handoff'],
    ['/cheonggye/admin/pass',308,'cgpass-legacy-handoff']
  ]){
    const probe=byUrl.get('https://ekodi.kr'+path);
    assert.ok(probe,path);
    assert.deepEqual(probe.statuses,[expected],path);
    assert.ok(probe.headerExpect.some(x=>x.includes('x-ekodi-route: '+route)),path);
    if(expected===308)assert.ok(probe.headerExpect.some(x=>x==='location: https://ekodi.kr'+(path.includes('/admin')?'/cgpass/admin':'/cgpass')),path);
  }
});

test('bounded D1 migration changes only known legacy domains and is idempotent',async()=>{
  const {DatabaseSync}=await import('node:sqlite');
  const db=new DatabaseSync(':memory:');
  db.exec('CREATE TABLE customer_tenants (id TEXT PRIMARY KEY,slug TEXT UNIQUE,domain TEXT UNIQUE)');
  db.exec('CREATE TABLE public_site_controls (site_id TEXT PRIMARY KEY,workspace_id TEXT,domain TEXT UNIQUE)');
  db.exec("INSERT INTO customer_tenants VALUES ('pass-immutable','cheonggye-pass','ekodi.kr/cheonggye/pass'),('cgma-immutable','cgma','ekodi.kr/cgma'),('external-immutable','other','customer.example')");
  db.exec("INSERT INTO public_site_controls VALUES ('cheonggye-pass','pass-immutable','ekodi.kr/cheonggyepass'),('cgma','cgma-immutable','ekodi.kr/cgma')");
  const sql=read('migrations/202611041700_cgpass_canonical_url.sql');
  db.exec(sql);db.exec(sql);
  const pass=db.prepare("SELECT * FROM customer_tenants WHERE slug='cheonggye-pass'").get();
  assert.equal(pass.id,'pass-immutable');
  assert.equal(pass.domain,'ekodi.kr/cgpass');
  assert.equal(db.prepare("SELECT domain FROM public_site_controls WHERE site_id='cheonggye-pass'").get().domain,'ekodi.kr/cgpass');
  assert.equal(db.prepare("SELECT domain FROM customer_tenants WHERE slug='cgma'").get().domain,'ekodi.kr/cgma');
  assert.equal(db.prepare("SELECT domain FROM customer_tenants WHERE slug='other'").get().domain,'customer.example');
  db.close();
});
