import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('service proxy uses the shared Shell for user-facing proxied domains',async()=>{
  const source=await read('service-proxy.js');
  assert.match(source,/injectEkodiShell/);
  assert.match(source,/shellServiceForHost/);
  for(const host of ['church.ekodi.kr','lab.ekodi.kr','mall.ekodi.kr','mall.biz.ekodi.kr'])assert.match(source,new RegExp(host.replaceAll('.','\\.')));
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
