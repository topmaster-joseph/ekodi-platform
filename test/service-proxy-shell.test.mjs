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
  assert.match(source,/MALL_CANONICAL = 'https:\/\/ekodi\.kr\/ekodibiz\/mall'/);
  assert.match(source,/'mall\.ekodi\.kr': MALL_CANONICAL/);
  assert.match(source,/'mall\.biz\.ekodi\.kr': MALL_CANONICAL/);
  assert.match(source,/Response\.redirect\(target\.toString\(\), 308\)/);
});

test('mail root is exclusively owned by the shared site core',async()=>{
  const [source,proxyConfig,siteConfig,entry]=await Promise.all([
    read('service-proxy.js'),
    read('wrangler.service-proxy.toml'),
    read('wrangler.site.toml'),
    read('platform-router-entry-worker.js'),
  ]);
  assert.doesNotMatch(source,/'mail\.ekodi\.kr': GMAIL/);
  assert.doesNotMatch(proxyConfig,/pattern = "mail\.ekodi\.kr"/);
  assert.match(proxyConfig,/pattern = "mail\.biz\.ekodi\.kr"/);
  assert.match(siteConfig,/pattern = "mail\.ekodi\.kr"/);
  assert.match(entry,/if\(host===MAIL_HOST\)/);
  assert.match(entry,/mailUserPage\(\)/);
  assert.match(entry,/mailAdminPage\(\)/);
  const workflow=await read('.github/workflows/deploy-site-core.yml');
  assert.match(workflow,/for host in ekodi\.kr admin\.ekodi\.kr auth\.ekodi\.kr mail\.ekodi\.kr; do/);
});


test('Mail aliases remain compatibility-only and converge on the constitutional Mail boundary',async()=>{
  const [source,proxyConfig,siteConfig,boundaries]=await Promise.all([
    read('service-proxy.js'),read('wrangler.service-proxy.toml'),read('wrangler.site.toml'),read('platform-boundaries.json')
  ]);
  assert.match(source,/const MAIL_CANONICAL = 'https:\/\/mail\.ekodi\.kr'/);
  assert.doesNotMatch(source,/mail\.google\.com/);
  for(const alias of ['mail.biz.ekodi.kr','mail.church.ekodi.kr','mail.lab.ekodi.kr','mail.books.ekodi.kr','mail.trade.ekodi.kr']){
    assert.match(source,new RegExp(`'${alias.replaceAll('.','\\.')}': MAIL_CANONICAL`));
    assert.match(proxyConfig,new RegExp(`pattern = "${alias.replaceAll('.','\\.')}"`));
    assert.doesNotMatch(siteConfig,new RegExp(`pattern = "${alias.replaceAll('.','\\.')}"`));
  }
  assert.match(boundaries,/"mail-service"[\s\S]*?"domains":\["mail\.ekodi\.kr","api\.ekodi\.kr"\]/);
});
