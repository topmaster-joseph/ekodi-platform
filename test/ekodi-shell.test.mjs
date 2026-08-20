import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { EKODI_SERVICE_MANIFEST, serviceForHost, serviceForId } from '../ekodi-service-manifest.js';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('service manifest is the person-space-role registry for future EKODI sites',()=>{
  assert.equal(EKODI_SERVICE_MANIFEST.identityModel,'person-space-role');
  assert.equal(EKODI_SERVICE_MANIFEST.shellVersion,1);
  assert.equal(EKODI_SERVICE_MANIFEST.onboardingPolicyVersion,1);
  const ids=EKODI_SERVICE_MANIFEST.services.map(s=>s.id);
  assert.equal(new Set(ids).size,ids.length);
  for(const required of ['my','marketing','community','church','business','work','author','books','lab','social','messenger','invest','energy','mall'])assert.ok(ids.includes(required),required);
  for(const service of EKODI_SERVICE_MANIFEST.services){
    assert.match(service.id,/^[a-z][a-z0-9-]*$/);
    assert.equal(new URL(service.url).protocol,'https:');
    assert.ok(Array.isArray(service.workspaceKinds)&&service.workspaceKinds.length>0);
    assert.ok(Array.isArray(service.capabilities)&&service.capabilities.length>0);
  }
  assert.equal(serviceForHost('church.ekodi.kr')?.id,'church');
  assert.equal(serviceForHost('messenger.ekodi.kr')?.id,'messenger');
  assert.equal(serviceForHost('invest.ekodi.kr')?.id,'invest');
  assert.equal(serviceForId('community')?.url,'https://community.ekodi.kr/');
});

test('browser shell preserves workspace context and returns space switching to My EKODI',async()=>{
  const client=await read('shell/shell.js');
  assert.match(client,/ekodi_workspace/);
  assert.match(client,/ekodi_shell_context:/);
  assert.match(client,/사람 → 공간 → 기능/);
  assert.match(client,/공간 전환 · My EKODI/);
  assert.match(client,/return_to/);
  assert.match(client,/auth\.ekodi\.kr/);
  assert.match(client,/workspace/);
  assert.match(client,/window\.EKODIShell/);
  assert.match(client,/setContext:mergeContext/);
  assert.match(client,/ekodi:context-change/);
});

test('shell injector is isolated in Shadow DOM and extends CSP instead of weakening it globally',async()=>{
  const [client,injector]=await Promise.all([read('shell/shell.js'),read('ekodi-shell-injector.js')]);
  assert.match(client,/attachShadow\(\{mode:'open'\}\)/);
  assert.match(injector,/HTMLRewriter/);
  assert.match(injector,/script-src/);
  assert.match(injector,/connect-src/);
  assert.match(injector,/https:\/\/shell\.ekodi\.kr/);
  assert.match(injector,/x-ekodi-shell/);
});

test('My, Community and shared service proxy all consume the same shell contract',async()=>{
  const [my,community,proxy]=await Promise.all([read('my-worker.js'),read('community-worker.js'),read('service-proxy.js')]);
  assert.match(my,/injectEkodiShell\(response,'my'\)/);
  assert.match(my,/contextModel:'person-space-role'/);
  assert.match(community,/injectEkodiShell\(withHeaders\(await env\.ASSETS\.fetch\(request\)\),'community'\)/);
  assert.match(proxy,/shellServiceForHost/);
  assert.match(proxy,/injectEkodiShell\(businessHub\(\), 'biz'\)/);
});

test('remaining Worker services use thin shared Shell adapters without moving domain logic',async()=>{
  const [business,work,author,books,social,energy,site,platform,platformEntry,workToml,socialToml,energyToml,siteToml]=await Promise.all([
    read('business-live-worker.js'),read('work-shell-worker.js'),read('author-worker.js'),read('books-worker.js'),read('social-shell-worker.js'),read('energy-shell-worker.js'),read('site-shell-worker.js'),read('platform-router-worker.js'),read('platform-router-entry-worker.js'),read('wrangler.work.toml'),read('wrangler.social.toml'),read('wrangler.energy.toml'),read('wrangler.site.toml')
  ]);
  assert.match(business,/injectEkodiShell\(await baseWorker\.fetch\(request,env,ctx\),'business'\)/);
  assert.match(work,/workWorker\.fetch/); assert.match(work,/,\s*'work'\)/);
  assert.match(author,/injectEkodiShell\(await authorHtml\(response\), 'author'\)/);
  assert.match(books,/injectEkodiShell\(await env\.ASSETS\.fetch\(request\), 'books'\)/);
  assert.match(social,/socialWorker\.fetch/); assert.match(social,/,\s*'social'\)/);
  assert.match(energy,/energyWorker\.fetch/); assert.match(energy,/,\s*'energy'\)/);
  assert.match(site,/trade\.biz\.ekodi\.kr/); assert.match(site,/pay\.ekodi\.kr/); assert.match(site,/shellServiceForHost/);
  assert.match(platform,/messenger\.ekodi\.kr/); assert.match(platform,/invest\.ekodi\.kr/); assert.match(platform,/injectEkodiShell/);
  assert.match(platformEntry,/legacyPlatformRouter\.fetch/); assert.match(platformEntry,/injectEkodiShell\(response,'messenger'\)/);
  assert.match(workToml,/main = "work-shell-worker\.js"/);
  assert.match(socialToml,/main = "social-shell-worker\.js"/);
  assert.match(energyToml,/main = "energy-shell-worker\.js"/);
  assert.match(siteToml,/main = "platform-router-entry-worker\.js"/);
});

test('Shell-enabled asset Workers cannot bypass their wrapper with direct static delivery',async()=>{
  const configs=await Promise.all([
    'wrangler.business.toml','wrangler.business-staging.toml','wrangler.work.toml','wrangler.work-staging.toml','wrangler.author.toml','wrangler.books.toml','wrangler.books.staging.toml','wrangler.social.toml','wrangler.social-staging.toml','wrangler.energy.toml','wrangler.energy-staging.toml','wrangler.site.toml','wrangler.site-staging.toml'
  ].map(read));
  for(const config of configs)assert.match(config,/run_worker_first\s*=\s*true/);
});

test('guarded production release contracts require the shared Shell on migrated service roots',async()=>{
  const manifests=await Promise.all([
    'deploy/manifests/business.worker.json','deploy/manifests/work.worker.json','deploy/manifests/author.worker.json','deploy/manifests/books.worker.json','deploy/manifests/social.worker.json','deploy/manifests/energy.worker.json','deploy/manifests/shared-site.worker.json'
  ].map(read));
  for(const manifest of manifests)assert.match(manifest,/https:\/\/shell\.ekodi\.kr\/shell\.js/);
  for(const manifest of manifests)assert.match(manifest,/x-ekodi-shell: v1/);
});

test('all active services have concrete Shell integration and new services use automatic onboarding',()=>{
  const pending=EKODI_SERVICE_MANIFEST.services.filter(service=>service.state!=='planned'&&service.shellIntegration==='pending').map(service=>service.id);
  assert.deepEqual(pending,[]);
  assert.equal(serviceForId('marketing')?.shellIntegration,'static-script');
  for(const id of ['messenger','invest']){
    const service=serviceForId(id);
    assert.equal(service?.onboardingVersion,EKODI_SERVICE_MANIFEST.onboardingPolicyVersion);
    assert.equal(service?.authMode,'client');
    assert.equal(service?.sso,true);
    assert.equal(service?.shellIntegration,'shared-proxy');
  }
});

test('production audit inventory is generated from the manifest rather than a hard-coded site list',async()=>{
  const generator=await read('scripts/build-shell-audit-matrix.mjs');
  const workflow=await read('.github/workflows/verify-shared-shell-production.yml');
  assert.match(generator,/EKODI_SERVICE_MANIFEST\.services/);
  assert.match(generator,/state!==['"]planned['"]/);
  assert.match(workflow,/build-shell-audit-matrix\.mjs/);
  assert.match(workflow,/fromJSON\(needs\.inventory\.outputs\.matrix\)/);
});

test('shell service exposes public manifest and health without account data',async()=>{
  const worker=await read('ekodi-shell-worker.js');
  assert.match(worker,/\/manifest\.json/);
  assert.match(worker,/identityModel/);
  assert.match(worker,/access-control-allow-origin/);
  assert.doesNotMatch(worker,/SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(worker,/access_token/);
});
