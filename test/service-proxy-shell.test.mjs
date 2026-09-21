import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('service proxy has no public custom-domain or redirect compatibility surface',async()=>{
  const [source,proxyConfig]=await Promise.all([
    read('service-proxy.js'),
    read('wrangler.service-proxy.toml'),
  ]);
  assert.doesNotMatch(source,/CANONICAL_REDIRECTS|const REDIRECTS\s*=|Response\.redirect/);
  assert.doesNotMatch(proxyConfig,/\[\[routes\]\]/);
  assert.doesNotMatch(proxyConfig,/custom_domain\s*=\s*true/);
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
  assert.doesNotMatch(stage,/custom_domain = true/);
});

test('Mail is owned by the canonical apex path without subdomain aliases',async()=>{
  const [siteConfig,entry,source,proxyConfig]=await Promise.all([
    read('wrangler.site.toml'),
    read('platform-router-entry-worker.js'),
    read('service-proxy.js'),
    read('wrangler.service-proxy.toml'),
  ]);
  assert.match(siteConfig,/pattern = "ekodi\.kr\/mail\*"[\s\S]{0,80}zone_name = "ekodi\.kr"/);
  assert.match(entry,/function routeMailApex\(request\)/);
  assert.match(entry,/url\.pathname==='\/mail'/);
  assert.match(entry,/url\.pathname==='\/mail\/admin'/);
  assert.match(entry,/mailUserPage\(\)/);
  assert.match(entry,/mailAdminPage\(/);
  for(const alias of ['mail.ekodi.kr','mail.biz.ekodi.kr','mail.church.ekodi.kr','mail.lab.ekodi.kr','mail.books.ekodi.kr','mail.trade.ekodi.kr']){
    assert.doesNotMatch(source,new RegExp(alias.replaceAll('.','\\.')));
    assert.doesNotMatch(proxyConfig,new RegExp(alias.replaceAll('.','\\.')));
  }
});
