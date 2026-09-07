import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { AFFILIATE_PARTNER_PROGRAMS, partnerProgramView } from '../affiliate-partner-programs.js';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

test('affiliate acquisition catalog spans domestic, global and China networks', () => {
  const keys = new Set(AFFILIATE_PARTNER_PROGRAMS.map(item => item.key));
  for (const key of ['coupang_partners','linkprice','adpick','tenping','impact','rakuten','cj','amazon_associates','awin','partnerize','admitad','taobao_alliance','jd_union','aliexpress_affiliate']) assert.ok(keys.has(key), key);
  assert.equal(keys.size, AFFILIATE_PARTNER_PROGRAMS.length);
  assert.ok(AFFILIATE_PARTNER_PROGRAMS.every(item => !item.url || item.url.startsWith('https://')));
  const coupang = AFFILIATE_PARTNER_PROGRAMS.find(item => item.key === 'coupang_partners');
  assert.equal(coupang.status, 'active');
  assert.equal(coupang.integration, 'live');
  assert.equal(coupang.external, 0);
});

test('new programs fail closed until external approval and merchant verification', () => {
  const candidates = AFFILIATE_PARTNER_PROGRAMS.filter(item => item.key !== 'coupang_partners');
  assert.ok(candidates.every(item => item.integration !== 'live'));
  const control = read('../affiliate-control.js');
  assert.match(control, /integrationStatus === 'live'.*approved.*active/);
  assert.match(control, /recommendationRequiresVerifiedTrackingAndCatalog: true/);
  assert.match(control, /affiliate\.program\.update/);
});

test('partner playbooks expose the next safe acquisition action', () => {
  const adpick = partnerProgramView({
    program_key:'adpick', program_name:'ADPICK Biz', program_kind:'network', region:'KR+GLOBAL', home_country:'KR', coverage_summary:'제휴 쇼핑몰',
    application_status:'prepared', integration_status:'not_ready', api_capable:1, deeplink_capable:1, product_feed_capable:1, reporting_capable:1,
    external_action_required:1, priority:96, program_url:'https://biz.adpick.co.kr/', notes:'', updated_at:'2026-09-08T00:00:00Z',
  });
  assert.match(adpick.nextAction, /공식 가입 페이지/);
  assert.equal(adpick.readinessScore, 20);
  assert.ok(adpick.requirements.includes('API Key'));
  assert.match(adpick.docsUrl, /^https:\/\//);
  assert.match(adpick.coverageSummary, /다음:/);
});

test('approved programs progress to integration verification, not recommendation', () => {
  const view = partnerProgramView({
    program_key:'cj', program_name:'CJ Affiliate', program_kind:'network', region:'GLOBAL', home_country:'US', coverage_summary:'글로벌',
    application_status:'approved', integration_status:'not_ready', api_capable:1, deeplink_capable:1, product_feed_capable:1, reporting_capable:1,
    external_action_required:1, priority:90, program_url:'https://www.cj.com/publisher', notes:'', updated_at:'2026-09-08T00:00:00Z',
  });
  assert.match(view.nextAction, /추적링크/);
  assert.equal(view.readinessScore, 70);
  assert.match(view.programUrl, /cj\.com\/join/);
});

test('migration and admin expose the partner acquisition pipeline', () => {
  const migration = read('../migrations/0066_affiliate_partner_pipeline.sql');
  const admin = read('../marketing-funnel-admin.js');
  assert.match(migration, /CREATE TABLE IF NOT EXISTS affiliate_partner_programs/);
  assert.match(migration, /ADPICK Biz/);
  assert.match(migration, /impact\.com/);
  assert.match(admin, /국내·글로벌 제휴처 확보 파이프라인/);
  assert.match(admin, /\/api\/affiliate\/programs/);
  assert.match(admin, /data-program-save/);
  assert.doesNotMatch(admin, /secretKey|accessKey|apiSecret/i);
});
