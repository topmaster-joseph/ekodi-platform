import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('tenant readability injector stays brand-neutral and idempotent',async()=>{
  const [injector,css]=await Promise.all([
    read('ekodi-shell-injector.js'),
    read('shell/user-ui-shell.css'),
  ]);
  assert.match(injector,/export function injectEkodiTenantReadability/);
  assert.match(injector,/x-ekodi-tenant-readability/);
  assert.match(injector,/data-ekodi-tenant-readability/);
  assert.match(injector,/mobile-fixed-header\.js/);
  assert.match(injector,/data-ekodi-fixed-header/);
  assert.match(injector,/OPERATING_SPACE_LABEL_HEADER='x-ekodi-operating-space-label'/);
  assert.match(injector,/data-ekodi-operating-space-label/);
  assert.match(injector,/options\?\.operatingSpace!==false/);
  assert.match(injector,/운영공간/);
  assert.match(injector,/x-ekodi-shell/);
  assert.match(injector,/x-ekodi-user-ui/);
  assert.match(injector,/sharedUiAlreadyPresent/);
  assert.doesNotMatch(injector,/sharedUiAlreadyPresent[^\n]*return response/);
  assert.match(injector,/if\(!sharedUiAlreadyPresent\)rewriter=rewriter\.on\('head',new TenantReadabilityHeadInjector\(\)\)/);
  assert.doesNotMatch(injector,/function injectEkodiTenantReadability[\s\S]*fallbackHeader\(/);
  assert.match(injector,/typeof HTMLRewriter!==['"]function['"]/);
  assert.match(css,/Brand-neutral tenant readability v1/);
  assert.match(css,/html\[data-ekodi-tenant-readability="v1"\]/);
  assert.match(css,/min-height:44px/);
  assert.match(css,/text-wrap:balance/);
  assert.match(css,/\.ekodi-operating-space-note\[data-ekodi-operating-space-label\]/);
});

test('live mobile verifier checks canonical apex tenant paths only',async()=>{
  const verifier=await read('scripts/verify-mobile-fixed-headers-live.mjs');
  for(const url of [
    'https://ekodi.kr/jadam',
    'https://ekodi.kr/pizzamaru',
    'https://ekodi.kr/yogurt',
    'https://ekodi.kr/cgma',
    'https://ekodi.kr/cgma/market-ai',
    'https://ekodi.kr/cgma/admin',
  ]) assert.ok(verifier.includes(url),`missing canonical verifier target: ${url}`);
  const origins=[...verifier.matchAll(/https:\/\/[^/'"`]+/g)].map(match=>match[0]);
  assert.ok(origins.length>0);
  assert.ok(origins.every(origin=>origin==='https://ekodi.kr'));
  assert.match(verifier,/tenant-readability-css/);
  assert.match(verifier,/live-readability-not-observed/);
});

test('tenant roots stay Worker-first without exceeding Cloudflare route capacity',async()=>{
  const wrangler=await read('wrangler.site.toml');
  const line=wrangler.match(/run_worker_first = \[(.*?)\]/s)?.[1]||'';
  const routes=[...line.matchAll(/"([^"]+)"/g)].map(match=>match[1]);
  assert.ok(routes.length<=100,'run_worker_first must stay within the Cloudflare route-entry limit');
  for(const route of ['/jadam*','/pizzamaru*','/yogurt*','/cgma*'])assert.ok(routes.includes(route),'missing consolidated tenant Worker-first route: '+route);
  for(const retired of ['/jadam/admin*','/jadam/marketing*','/pizzamaru/admin*','/pizzamaru/marketing*','/pizzamaru/mokpodae*','/yogurt/admin*','/yogurt/marketing*','/cgma/marketing*'])assert.ok(!routes.includes(retired),'redundant tenant route should be consolidated: '+retired);
});

test('remaining canonical business, trade and lab surfaces inherit a readability contract',async()=>{
  const [router,canonical,verifier]=await Promise.all([
    read('platform-router-entry-worker.js'),
    read('canonical-surface-router.js'),
    read('scripts/verify-mobile-fixed-headers-live.mjs'),
  ]);
  assert.match(router,/routeEkodiBizPublic[\s\S]*injectEkodiProgressiveHome\(injectEkodiTenantReadability\(rewritten\)\)/);
  assert.match(router,/LEGACY_OPERATING_SPACE_ROOTS=new Set\(\['ekodichurch','ekodimission'\]\)/);
  assert.match(router,/async function ensureLegacyOperatingSpaceMarker/);
  assert.match(router,/html\.includes\('data-ekodi-operating-space-label'\)/);
  assert.match(router,/legacyOperatingSpacePath\(url\.pathname\)\)return ensureLegacyOperatingSpaceMarker\(injectEkodiTenantReadability\(legacyResponse\)\)/);
  assert.match(router,/isTradePartnerPath\(url\.pathname\)\)return injectEkodiTenantReadability\(tradePartnerPage\(\)\)/);
  assert.match(canonical,/executionSurface\.id==='lab'\?injectEkodiTenantReadability\(response\):response/);
  assert.match(verifier,/requireReadability\(cgmaRoot,'cgma-root',errors\)/);
  assert.doesNotMatch(verifier,/need\(cgmaRoot,'cgma-root','data-ekodi-tenant-readability/);
});

test('owned root services keep tenant readability after shared Shell injection',async()=>{
  const siteShell=await read('site-shell-worker.js');
  assert.match(siteShell,/ownedCustomerSiteFor/);
  assert.match(siteShell,/const shelled=!progressiveHome&&serviceId[\s\S]*injectEkodiShell\(response,serviceId/);
  assert.match(siteShell,/ownedCustomerSiteFor\(serviceId\)\?injectEkodiTenantReadability\(shelled\):shelled/);
});

test('guarded release requires the operating-space distinction on representative live sites',async()=>{
  const manifest=JSON.parse(await read('deploy/manifests/shared-site.worker.json'));
  const churchCanonical=manifest.worker.requests.find(item=>item.url==='https://ekodi.kr/ekodichurch');
  assert.ok(churchCanonical,'missing Church canonical slash redirect probe');
  assert.deepEqual(churchCanonical.statuses,[308]);
  assert.ok(churchCanonical.headerExpect?.includes('location: https://ekodi.kr/ekodichurch/'));
  assert.ok(churchCanonical.headerExpect?.includes('x-ekodi-route: church-path-canonical'));
  assert.equal(churchCanonical.rollbackVerify,false);

  for(const url of [
    'https://ekodi.kr/ekodichurch/',
    'https://ekodi.kr/ekodibiz',
    'https://ekodi.kr/cgma',
    'https://ekodi.kr/jadam',
    'https://ekodi.kr/pizzamaru',
    'https://ekodi.kr/yogurt',
  ]){
    const probe=manifest.worker.requests.find(item=>item.url===url);
    assert.ok(probe,'missing operating-space release probe: '+url);
    assert.deepEqual(probe.statuses,[200]);
    if(url==='https://ekodi.kr/ekodichurch/'){
      assert.ok(probe.expect?.includes('WELCOME TO EKODI CHURCH'),'Church probe must bind to the actual public-page identity');
      assert.ok(probe.expect?.includes('에코디교회'),'Church probe must retain the Korean service identity');
    }
    assert.ok(probe.expect?.includes('운영공간'),url+' must render the operating-space distinction');
    assert.ok(probe.headerExpect?.includes('x-ekodi-operating-space-label: v1'),url+' must prove shared operating-space ownership');
    assert.equal(probe.rollbackVerify,false);
  }
});
