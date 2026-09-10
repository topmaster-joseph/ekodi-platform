import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const worker = fs.readFileSync(new URL('../ekodibiz-worker.js', import.meta.url), 'utf8');
const adapter = fs.readFileSync(new URL('../ekodibiz-payment-architecture.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../ekodibiz/index.html', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../ekodibiz/app.js', import.meta.url), 'utf8');
const site = fs.readFileSync(new URL('../ekodibiz/site.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../ekodibiz/style.css', import.meta.url), 'utf8');
const config = fs.readFileSync(new URL('../wrangler.ekodibiz.toml', import.meta.url), 'utf8');
const staging = fs.readFileSync(new URL('../wrangler.ekodibiz-staging.toml', import.meta.url), 'utf8');

test('EKODIBIZ stays separate from common Business OS', () => {
  assert.match(config, /pattern = "biz\.ekodi\.kr"/);
  assert.doesNotMatch(config, /pattern = "business\.ekodi\.kr"/);
  assert.match(config, /main = "ekodibiz-payment-architecture\.js"/);
  assert.match(adapter, /from '\.\/ekodibiz-worker\.js'/);
});

test('public UI stays simple while the revenue engine remains available behind operations', () => {
  assert.match(html, /WHAT WE DO/);
  assert.match(html, /프로그램 개발/);
  assert.match(html, /도서출판/);
  assert.doesNotMatch(html, /<header[\s\S]*관계자 로그인[\s\S]*<\/header>/);
  assert.doesNotMatch(html, /무엇을 이루고 싶으세요/);
  assert.doesNotMatch(html, /id="goalForm"/);
  for (const endpoint of ['/api/consult','/api/offers','/api/checkout-intent','/api/ops/status']) assert.match(app, new RegExp(endpoint.replaceAll('/','\\/')));
});

test('public company page moves partner access behind business-area detail views', () => {
  assert.match(html, /id="detailView"/);
  assert.match(html, /data-i18n="partnerLogin"/);
  assert.match(site, /type==='trade'/); assert.match(site, /https:\/\/ekodi\.kr\/ekodibiz\/trade/);
  assert.match(html, /<link rel="canonical" href="https:\/\/ekodi\.kr\/ekodibiz">/);
  assert.match(css, /position:sticky/);
  assert.match(css, /@media\(max-width:600px\)/);
});

test('business inquiries use a browser-based Gmail composer instead of mailto', () => {
  assert.match(html, /https:\/\/mail\.google\.com\/mail\/\?view=cm/);
  assert.doesNotMatch(html, /mailto:/);
  assert.match(site, /mail\.google\.com\/mail\/\?view=cm/);
});

test('business areas and common shell are localized as one surface', () => {
  for (const area of ['software','solar','mall','consulting','trade','publishing','ai-ops','marketing','invest']) assert.match(html, new RegExp(`data-business="${area}"`));
  assert.match(html, /data-site-shell="header"/);
  assert.match(html, /data-site-shell="footer"/);
  assert.match(html, /id="languageSelect"/);
  assert.match(site, /document\.documentElement\.lang=locale/);
  for (const lang of ['ko-KR','en','zh-CN','ja','ne','vi']) assert.match(site, new RegExp(`['\"]${lang}['\"]`));
  assert.match(site, /ekodi_locale/);
  assert.match(site, /document\.querySelectorAll\('\[data-i18n\]'\)/);
  assert.match(site, /document\.querySelectorAll\('\[data-i18n-html\]'\)/);
});

test('personalized catalog offers several repeatable revenue paths', () => {
  for (const offer of ['30일 자동홍보팩','온라인 개업팩','행사 완성팩','단골·재방문 성장팩','문의·예약 전환팩','구독·멤버십 수익팩','콘텐츠 수익화팩']) assert.match(worker, new RegExp(offer));
  for (const intent of ['repeat','sales','recurring','creator']) assert.match(worker, new RegExp(`'${intent}'`));
  assert.match(worker, /suggestedOffers: suggested/);
  assert.match(app, /slice\(0,\s*4\)/);
});

test('shared user footer stays centered and keeps legal and contact routes visible', () => {
  assert.match(html, /개인정보처리방침/);
  assert.match(html, /이용약관/);
  assert.match(html, /mail\.google\.com/);
  assert.match(html, /Turn value into a business/);
  assert.match(css, /\.footer/);
  assert.match(css, /grid-template-columns/);
});

test('high impact actions are approval-gated and prices are not invented', () => {
  for (const action of ['payment','ad_spend','refund','contract','price_change','external_publish']) assert.match(worker, new RegExp(`'${action}'`));
  assert.match(worker, /approval_required/);
  assert.match(worker, /quote_required/);
  assert.match(worker, /amount: null/);
  assert.match(worker, /https:\/\/pay\.ekodi\.kr/);
  assert.match(adapter, /https:\/\/ekodi\.kr\/ekodibiz\/pay/);
});

test('worker exposes operational APIs and persistent AI staff queue', () => {
  for (const endpoint of ['/api/health','/api/runtime','/api/catalog','/api/consult','/api/offers','/api/execution-preview','/api/checkout-intent','/api/ops/status']) assert.match(worker, new RegExp(endpoint.replaceAll('/','\\/')));
  assert.match(worker, /export class RevenueStore extends DurableObject/);
  for (const role of ['growth_scout','offer_builder','ops_coordinator','finance_gatekeeper']) assert.match(worker, new RegExp(role));
  assert.match(worker, /processSafeTasks/);
  assert.match(worker, /personalDataMode: 'anonymous-goal-only'/);
});

test('production and staging use SQLite Durable Object persistence', () => {
  for (const source of [config, staging]) {
    assert.match(source, /name = "REVENUE_STORE"/);
    assert.match(source, /class_name = "RevenueStore"/);
    assert.match(source, /\[exports\.RevenueStore\]/);
    assert.match(source, /storage = "sqlite"/);
  }
});

test('free-tier operations stay event-driven without consuming a dedicated cron slot', () => {
  assert.doesNotMatch(config, /\[triggers\]/);
  assert.doesNotMatch(config, /crons\s*=/);
  assert.match(config, /AI_OPERATIONS_MODE = "rules-first-event-driven"/);
  assert.match(worker, /ctx\?\.waitUntil\(processSafeTasks\(env\)\)/);
});

test('public page collects no anonymous intake while backend safeguards remain explicit', () => {
  assert.doesNotMatch(html, /<form/i);
  assert.doesNotMatch(html, /name=["'](?:email|phone|name)["']/i);
  assert.match(worker, /containsContactData: false/);
  assert.match(worker, /personalDataMode: 'anonymous-goal-only'/);
});