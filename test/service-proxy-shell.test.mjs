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

test('public Biz hub starts from customer problems and hands intent to Business OS',async()=>{
  const [source,next]=await Promise.all([read('service-proxy.js'),read('business/customer-next.js')]);
  for(const term of ['사업하면서 지금 가장 해결하고 싶은 것은 무엇인가요','매출을 늘리고 싶어요','단골을 늘리고 싶어요','홍보를 맡기고 싶어요','비용을 줄이고 싶어요','사람이 필요해요','잘 모르겠어요. 한번 봐주세요']) assert.match(source,new RegExp(term));
  for(const problem of ['sales','repeat','marketing','cost','people','unsure']) assert.match(source,new RegExp(`problem=${problem}`));
  assert.match(source,/1호 실증 · 자담치킨 목포대점/);
  assert.match(source,/기본 진단은 가볍게 · 실제 실행과 만들어진 가치에서 수익/);
  assert.match(next,/initialProblemFromUrl/);
  assert.match(next,/URLSearchParams\(location\.search\)/);
  assert.match(next,/renderNextStep\(initialProblemFromUrl\(\)\)/);
});

test('legacy Biz utilities stay backstage rather than disappearing',async()=>{
  const source=await read('service-proxy.js');
  for(const url of ['trade.biz.ekodi.kr','mall.biz.ekodi.kr','pay.biz.ekodi.kr','mail.biz.ekodi.kr','live.biz.ekodi.kr']) assert.match(source,new RegExp(url.replaceAll('.','\\.')));
  assert.match(source,/전문 서비스는 뒤에서 작동합니다/);
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
