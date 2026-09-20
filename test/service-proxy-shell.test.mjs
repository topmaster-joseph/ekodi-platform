import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('service proxy uses the shared Shell for user-facing proxied domains',async()=>{
  const source=await read('service-proxy.js');
  assert.match(source,/injectEkodiShell/);
  assert.match(source,/shellServiceForHost/);
  for(const host of ['church.ekodi.kr','lab.ekodi.kr'])assert.match(source,new RegExp(host.replaceAll('.','\\.')));
  assert.match(source,/injectEkodiShell\(businessHub\(\), 'biz'\)/);
  const [proxyConfig,boundaries]=await Promise.all([read('wrangler.service-proxy.toml'),read('platform-boundaries.json')]);
  assert.doesNotMatch(proxyConfig,/pattern = \"church\.ekodi\.kr\"/);
  assert.doesNotMatch(proxyConfig,/pattern = \"lab\.ekodi\.kr\"/);
  assert.doesNotMatch(boundaries,/\"domains\":\[\"biz\.ekodi\.kr\",\"church\.ekodi\.kr/);
  assert.doesNotMatch(boundaries,/\"domains\":\[\"biz\.ekodi\.kr\",\"lab\.ekodi\.kr/);
});

test('staging host simulation is impossible in production',async()=>{
  const source=await read('service-proxy.js');
  assert.match(source,/env\?\.ENVIRONMENT !== 'staging'/);
  assert.match(source,/x-ekodi-staging-host/);
  assert.match(source,/STAGING_HOSTS\.has\(requested\)/);
  assert.match(source,/upstreamRequest\.headers\.delete\('x-ekodi-staging-host'\)/);
});

test('production config explicitly disables staging host behavior',async()=>{
  const [prod,stage]=await Promise.all([read('wrangler.service-proxy.toml'),read('wrangler.service-proxy.staging.toml')]);
  assert.match(prod,/ENVIRONMENT = "production"/);
  assert.match(stage,/ENVIRONMENT = "staging"/);
  assert.doesNotMatch(stage,/church\.ekodi\.kr/);
  assert.doesNotMatch(stage,/custom_domain = true/);
});

test('retired Mall subdomains permanently redirect to the canonical EKODIBIZ path',async()=>{
  const source=await read('service-proxy.js');
  assert.match(source,/MALL_CANONICAL = 'https:\/\/ekodi\.kr\/ekodibiz\/ekodimall'/);
  assert.match(source,/'mall\.ekodi\.kr': MALL_CANONICAL/);
  assert.match(source,/'mall\.biz\.ekodi\.kr': MALL_CANONICAL/);
  assert.match(source,/Response\.redirect\(target\.toString\(\), 308\)/);
});

test('mail root is exclusively owned by the shared site apex path',async()=>{
  const [siteConfig,entry]=await Promise.all([
    read('wrangler.site.toml'),
    read('platform-router-entry-worker.js'),
  ]);
  assert.match(siteConfig,/pattern = "ekodi\.kr\/mail\*"[\s\S]{0,80}zone_name = "ekodi\.kr"/);
  assert.match(entry,/function routeMailApex\(request\)/);
  assert.match(entry,/url\.pathname==='\/mail'/);
  assert.match(entry,/url\.pathname==='\/mail\/admin'/);
  assert.match(entry,/mailUserPage\(\)/);
  assert.match(entry,/mailAdminPage\(/);
  const workflow=await read('.github/workflows/deploy-site-core.yml');
  assert.match(workflow,/root_host='ekodi\.kr'/);
  assert.match(workflow,/Required Cloudflare Worker domain is not attached: \$root_host/);
});


test('Mail is apex-owned and retired aliases are absent from the service proxy',async()=>{
  const [source,proxyConfig,siteConfig,boundaries]=await Promise.all([
    read('service-proxy.js'),read('wrangler.service-proxy.toml'),read('wrangler.site.toml'),read('platform-boundaries.json')
  ]);
  assert.doesNotMatch(source,/MAIL_CANONICAL/);
  assert.match(source,/href=\"https:\/\/ekodi\.kr\/mail\"/);
  const apex=['ekodi','kr'].join('.');
  const aliases=['mail.biz','mail.church','mail.lab','mail.books','mail.trade'].map(prefix=>`${prefix}.${apex}`);
  for(const alias of aliases){
    const escaped=alias.replaceAll('.','\\\\.');
    assert.doesNotMatch(source,new RegExp(escaped));
    assert.doesNotMatch(proxyConfig,new RegExp(escaped));
    assert.doesNotMatch(siteConfig,new RegExp(escaped));
  }
  const boundaryJson=JSON.parse(boundaries);
  assert.deepEqual(boundaryJson.platforms['mail-service'].domains,['ekodi.kr']);
  assert.equal(boundaryJson.platforms['mail-service'].canonicalPath,'https://ekodi.kr/mail');
});
