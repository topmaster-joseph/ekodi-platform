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

test('public homepage is intent-first and does not lead with the full directory', () => {
  assert.match(js, /원하는 일, 바로 시작하세요/);
  assert.match(js, /오늘 무엇을 하시나요\?/);
  assert.match(js, /intentSets/);
  assert.match(js, /function rankServices/);
  assert.match(js, /slice\(0, limit\)/);
  assert.match(js, /dataset\.livingGateway = 'v5-intent-journey'/);
  assert.match(js, /daily-connect intent-panel/);
  assert.match(js, /function arrangeHomepageJourney/);
  assert.match(css, /\.daily-connect\{/);
  assert.match(css, /\.intent-results/);
  assert.match(css, /EKODI homepage intent journey v5/);
  assert.match(css, /body\[data-living-gateway="v5-intent-journey"\] #ecosystem\{display:none!important\}/);
  assert.match(css, /\.about-grid\{grid-template-columns:1fr!important/);
  assert.match(css, /\.hero\{display:flex!important;flex-direction:column!important/);
});

test('intent gateway reveals services only after category selection or search', () => {
  assert.match(js, /data-service-status|dataset\.serviceStatus/);
  assert.match(js, /renderRecommendations/);
  assert.match(js, /limit = 5/);
  assert.match(js, /id:'all'/);
  assert.match(js, /results\.hidden = true/);
  assert.match(js, /results\.hidden = false/);
  assert.match(js, /intent\.id === 'all'/);
  assert.doesNotMatch(js, /buildQuickLinks/);
  assert.doesNotMatch(js, /quickPaths/);
  assert.match(js, /무료로 시작/);
  assert.doesNotMatch(js, /data-status-filter/);
  assert.doesNotMatch(js, /function applyFilter/);
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
  assert.match(css, /body::before,[\s\S]*?z-index:0/);
  assert.match(css, /\.site-header,[\s\S]*?main\{[\s\S]*?z-index:1/);
  assert.doesNotMatch(css, /body::before,[\s\S]*?z-index:-1/);
});

test('ambient assets are shipped and injected into the EKODI homepage build', () => {
  assert.match(build, /'homepage-ambient\.css'/);
  assert.match(build, /'homepage-ambient\.js'/);
  assert.match(build, /href="\/homepage-ambient\.css"/);
  assert.match(build, /src="\/homepage-ambient\.js"/);
});
