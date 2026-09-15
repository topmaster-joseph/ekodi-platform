import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  EKODIBIZ_INVEST_BUSINESS,
  ekodiBizInvestBusinessPage,
  isEkodiBizInvestPath,
} from '../ekodibiz-invest-business.js';

test('EKODIBIZ Invest business lives under the public workspace namespace', () => {
  for (const path of [
    '/ekodibiz/invest',
    '/ekodibiz/invest/projects',
    '/ekodibiz/invest/ir',
    '/ekodibiz/invest/connect',
    '/ekodibiz/invest/programs',
  ]) assert.equal(isEkodiBizInvestPath(path), true, path);
  assert.equal(isEkodiBizInvestPath('/ekodibiz/invest/unknown'), false);
  assert.equal(isEkodiBizInvestPath('/invest'), false);
  assert.equal(EKODIBIZ_INVEST_BUSINESS.canonicalPath, '/ekodibiz/invest');
  assert.equal(EKODIBIZ_INVEST_BUSINESS.commonService, 'https://ekodi.kr/invest');
});
test('business page keeps EKODIBIZ business and common Invest boundaries explicit', async () => {
  const response = ekodiBizInvestBusinessPage(new Request('https://ekodi.kr/ekodibiz/invest/ir'));
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /data-ekodi-workspace="ekodibiz"/);
  assert.match(html, /data-ekodi-business-unit="invest"/);
  assert.match(html, /IR · 투자유치 지원/);
  assert.match(html, /https:\/\/ekodi\.kr\/invest/);
  assert.match(html, /공통 투자 분석·실사 엔진/);
  assert.match(html, /투자금 수취·주문·체결·수탁·수익보장/);
});

test('shared-site router owns the business path before the final static fallback', async () => {
  const source = await readFile(new URL('../site-worker.js', import.meta.url), 'utf8');
  const businessRoute = source.indexOf('isEkodiBizInvestPath(url.pathname)');
  const fallbackRoute = source.lastIndexOf('return env.ASSETS.fetch(request)');
  assert.ok(businessRoute > 0);
  assert.ok(fallbackRoute > businessRoute);
  assert.match(source, /public-ekodibiz-invest/);
  assert.match(source, /injectEkodiShell\(secured, 'biz', 'public'\)/);
});

test('shared-site release probe follows the canonical Invest boundary and rejects the retired subdomain marker', async () => {
  const manifest = JSON.parse(await readFile(new URL('../deploy/manifests/shared-site.worker.json', import.meta.url), 'utf8'));
  const probe = manifest.worker.requests.find(item => item.url === 'https://ekodi.kr/ekodibiz/invest');
  assert.ok(probe, 'EKODIBIZ Invest release probe must exist');
  assert.ok(probe.expect.includes('ekodi.kr/invest'));
  assert.ok(probe.expect.includes('data-ekodi-business-unit="invest"'));
  assert.equal(probe.expect.includes('invest.ekodi.kr'), false);
  assert.ok(probe.headerExpect.includes('x-ekodi-route: public-ekodibiz-invest'));
});

test('Invest remains a registered common-service boundary outside EKODIBIZ business ownership', async () => {
  const constitution = JSON.parse(await readFile(new URL('../governance/constitution/constitution.json', import.meta.url), 'utf8'));
  const boundaries = JSON.parse(await readFile(new URL('../platform-boundaries.json', import.meta.url), 'utf8'));
  assert.ok(constitution.registeredCommonServicePaths.includes('/invest'));
  assert.equal(boundaries.platforms.invest.kind, 'common-service-platform');
  assert.deepEqual(boundaries.platforms.invest.domains, ['ekodi.kr']);
  assert.equal(boundaries.platforms.invest.canonicalPath, 'https://ekodi.kr/invest');
  assert.match(boundaries.platforms.invest.note, /EKODIBIZ-specific investment businesses remain under ekodi\.kr\/ekodibiz\/invest/);
});