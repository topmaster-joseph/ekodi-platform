import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../homepage-ambient.css', import.meta.url), 'utf8');
const js = await readFile(new URL('../homepage-ambient.js', import.meta.url), 'utf8');
const build = await readFile(new URL('../scripts/build.mjs', import.meta.url), 'utf8');
const deploySiteCore = await readFile(new URL('../.github/workflows/deploy-site-core.yml', import.meta.url), 'utf8');

test('homepage keeps a translucent daily Seoul-date ambient scene', () => {
  assert.match(css, /body::before/);
  assert.match(css, /backdrop-filter:blur/);
  assert.match(css, /ekodiAmbientDrift/);
  assert.match(js, /const palettes = \[/);
  assert.match(js, /Asia\/Seoul/);
  assert.match(js, /function dailySeed/);
  assert.match(js, /dataset\.dailyDate/);
  assert.match(js, /--ambient-a/);
  assert.doesNotMatch(js, /crypto\.getRandomValues\(/);
  assert.doesNotMatch(js, /Math\.random\(/);
  assert.match(deploySiteCore, /'homepage-ambient\.js'/);
  assert.match(deploySiteCore, /'homepage-ambient\.css'/);
  assert.match(deploySiteCore, /npm run build/);
});

test('public homepage leads with a calm personalized first view', () => {
  assert.match(js, /원하는 일, 바로 시작하세요/);
  assert.match(js, /function buildDynamicVisual/);
  assert.match(js, /function buildQuickLaunch/);
  assert.match(js, /무엇을 하시나요\?/);
  assert.match(js, /dataset\.livingGateway = 'v7-calm-personal'/);
  assert.match(js, /목적별 빠른 시작/);
  assert.match(js, /전체 서비스 보기/);
  assert.match(css, /EKODI calm personalized landing v7/);
  assert.match(css, /EKODI homepage intent-first v8/);
  assert.match(css, /v7-calm-personal/);
  assert.match(css, /#ecosystem:has\(#services:target\)/);
});

test('quick launch respects homepage presentation and recommends only visible service cards', () => {
  assert.match(js, /applyHomepagePresentation/);
  assert.match(js, /querySelectorAll\('\.service-card\[data-service-status\]\[data-service-id\]'\)\]\.filter\(card=>!card\.hasAttribute\('hidden'\)\)/);
  assert.match(js, /공동체 · 사역/);
  assert.match(js, /사업 · 성장/);
  assert.match(js, /글 · 콘텐츠/);
  assert.match(js, /연구 · 배움/);
  assert.match(js, /일 · 프로젝트/);
  assert.match(js, /내 활동/);
  assert.match(js, /renderRecommendations\(results,cards,query/);
  assert.match(js, /syncVisibleStatusCounts/);
  assert.match(js, /dynamic-more-link/);
  assert.doesNotMatch(js, /dataset\.quickService = 'mail'/);
  assert.doesNotMatch(js, /dataset\.quickService = 'live'/);
  assert.doesNotMatch(js, /data-status-filter=/);
  assert.doesNotMatch(js, /function applyFilter/);
});

test('static Korean cards preserve English translation metadata for locale switching', () => {
  assert.match(js, /card\.dataset\.serviceNameEn/);
  assert.match(js, /card\.dataset\.serviceDescriptionEn/);
  assert.match(js, /card\.dataset\.ekodiEnTitle/);
  assert.match(js, /card\.dataset\.ekodiEnDescription/);
});

test('homepage locale handling keeps Korean English Chinese and Japanese paths', () => {
  assert.match(js, /ekodi_user_locale/);
  assert.match(js, /ekodi\.locale/);
  assert.match(js, /'ko-KR'/);
  assert.match(js, /'zh-CN'/);
  assert.match(js, /en:/);
  assert.match(js, /ja:/);
  assert.match(js, /document\.documentElement\.lang=locale|document\.documentElement\.lang = locale/);
  assert.match(js, /ekodi:locale-change/);
  assert.match(css, /@media\(max-width:640px\)/);
});

test('ambient layer stays visible above the body background and below content', () => {
  assert.match(css, /body::before,\s*body::after\{[\s\S]*?z-index:0/);
  assert.match(css, /\.site-header,\s*main\{[\s\S]*?z-index:1/);
  assert.doesNotMatch(css, /body::before,\s*body::after\{[^}]*z-index:-1/);
});

test('ambient assets are shipped and injected into the EKODI homepage build', () => {
  assert.match(build, /'homepage-ambient\.css'/);
  assert.match(build, /'homepage-ambient\.js'/);
  assert.match(build, /href="\/homepage-ambient\.css"/);
  assert.match(build, /src="\/homepage-ambient\.js"/);
});
