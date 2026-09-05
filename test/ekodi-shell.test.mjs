import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('service manifest is the person-space-role registry for future EKODI sites',async()=>{
  const manifest=await read('ekodi-service-manifest.js');
  assert.match(manifest,/person-space-role/);
  assert.match(manifest,/defaultSurface/);
  assert.match(manifest,/serviceForHost/);
  assert.match(manifest,/serviceForId/);
});

test('browser shell preserves workspace context, bounded surfaces and intent-first navigation',async()=>{
  const shell=await read('shell/shell.js');
  assert.match(shell,/ekodiShellSurface/);
  assert.match(shell,/workspace/);
  assert.match(shell,/document/);
  assert.match(shell,/form/);
  assert.match(shell,/data/);
  assert.match(shell,/EKODI 다음 행동/);
  assert.match(shell,/원하는 일을 고르거나 적어보세요/);
  assert.match(shell,/suggestedServices/);
  assert.match(shell,/slice\(0,3\)/);
  assert.match(shell,/모든 서비스 보기/);
  assert.match(shell,/내 공간 · My EKODI/);
});

test('shell injector is isolated in Shadow DOM and applies shared style only to internal surfaces',async()=>{
  const [injector,workspaceCss]=await Promise.all([read('ekodi-shell-injector.js'),read('shell/workspace.css')]);
  assert.match(injector,/SHELL_ORIGIN/);
  assert.match(injector,/INTERNAL_SURFACES/);
  assert.match(injector,/x-ekodi-shell','v2/);
  assert.match(workspaceCss,/data-ekodi-shell-surface="workspace"/);
  assert.match(workspaceCss,/data-ekodi-document-surface/);
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
  const [business,work,author,books,social,energy,site,shellInjector,platform,platformEntry,workToml,socialToml,energyToml,siteToml]=await Promise.all([
    read('business-live-worker.js'),read('work-shell-worker.js'),read('author-worker.js'),read('books-worker.js'),read('social-shell-worker.js'),read('energy-shell-worker.js'),read('site-shell-worker.js'),read('ekodi-shell-injector.js'),read('platform-router-worker.js'),read('platform-router-entry-worker.js'),read('wrangler.work.toml'),read('wrangler.social.toml'),read('wrangler.energy.toml'),read('wrangler.site.toml')
  ]);
  assert.match(business,/injectEkodiShell\(await baseWorker\.fetch\(request,env,ctx\),'business'\)/);
  assert.match(work,/workWorker\.fetch/); assert.match(work,/,\s*'work'\)/);
  assert.match(author,/injectEkodiShell\(await authorHtml\(response\), 'author'\)/);
  assert.match(books,/injectEkodiShell\(await env\.ASSETS\.fetch\(request\), 'books'\)/);
  assert.match(social,/socialWorker\.fetch/); assert.match(social,/,\s*'social'\)/);
  assert.match(energy,/energyWorker\.fetch/); assert.match(energy,/,\s*'energy'\)/);
  assert.match(site,/shellServiceForHost/);
  assert.match(shellInjector,/manifestServiceForHost/); assert.match(shellInjector,/SPECIAL_HOST_ALIASES/); assert.match(shellInjector,/trade\.biz\.ekodi\.kr/); assert.match(shellInjector,/shellServiceForRootPath/);
  assert.match(platform,/messenger\.ekodi\.kr/); assert.match(platform,/invest\.ekodi\.kr/); assert.match(platform,/injectEkodiShell/);
  assert.match(platformEntry,/legacyPlatformRouter\.fetch/); assert.match(platformEntry,/injectEkodiShell\(response,'messenger'\)/);
  assert.match(workToml,/main = "work-shell-worker\.js"/);
  assert.match(socialToml,/main = "social-shell-worker\.js"/);
  assert.match(energyToml,/main = "energy-shell-worker\.js"/);
  assert.match(siteToml,/main = "platform-router-entry-worker\.js"/);
});

test('Shell-enabled asset Workers keep dynamic roots and APIs behind their wrapper',async()=>{
  const configs=await Promise.all([
    'wrangler.business.toml','wrangler.business-staging.toml','wrangler.work.toml','wrangler.work-staging.toml','wrangler.author.toml','wrangler.books.toml','wrangler.books.staging.toml','wrangler.social.toml','wrangler.social-staging.toml','wrangler.energy.toml','wrangler.energy-staging.toml','wrangler.site.toml','wrangler.site-staging.toml'
  ].map(read));
  for(const config of configs){
    if(/run_worker_first\s*=\s*true/.test(config))continue;
    const routes=config.match(/run_worker_first\s*=\s*\[([^\]]+)\]/)?.[1]||'';
    assert.match(routes,/"\/"/);
    assert.match(routes,/"\/api\/\*"/);
  }
});

test('bundled shell uses edge cache before rebuilding fifteen static asset fragments',async()=>{
  const worker=await read('ekodi-shell-worker.js');
  assert.match(worker,/caches\.default/);
  assert.match(worker,/bundleCache\.match\(bundleCacheKey\)/);
  assert.match(worker,/bundleCache\.put\(bundleCacheKey,stored\)/);
  assert.match(worker,/x-ekodi-shell-bundle-cache','hit/);
  assert.match(worker,/bundledShell\(request,env,ctx\)/);
});

test('bundled shell isolates an optional asset fetch rejection',async()=>{
  const {default:worker}=await import('../ekodi-shell-worker.js');
  const env={ENVIRONMENT:'test',ASSETS:{fetch:async request=>{
    const path=new URL(request.url).pathname;
    if(path==='/user-character.js')throw new Error('transient asset failure');
    return new Response(path==='/shell.js'?'window.shellCore=true;':`// ${path}`,{status:200});
  }}};
  const response=await worker.fetch(new Request('https://shell.ekodi.kr/shell.js'),env,{waitUntil(){}});
  assert.equal(response.status,200);
  assert.equal(response.headers.get('x-ekodi-user-character'),'missing');
  assert.match(await response.text(),/window\.shellCore=true/);
});

test('bundled shell converts core asset rejection into controlled 503',async()=>{
  const {default:worker}=await import('../ekodi-shell-worker.js');
  const env={ENVIRONMENT:'test',ASSETS:{fetch:async request=>{
    if(new URL(request.url).pathname==='/shell.js')throw new Error('core asset failure');
    return new Response('// optional',{status:200});
  }}};
  const response=await worker.fetch(new Request('https://shell.ekodi.kr/shell.js'),env,{waitUntil(){}});
  assert.equal(response.status,503);
  assert.equal(response.headers.get('x-ekodi-shell-asset-error'),'fetch_failed');
});
