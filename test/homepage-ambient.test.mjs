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
  assert.match(deploySiteCore, /grep -Fq 'function seoulDateKey'/);
  assert.match(deploySiteCore, /grep -Fq 'function dailySeed'/);
});

test('public homepage is hook-first and routes intent instead of leading with a directory', () => {
  assert.match(js, /원하는 일, 바로 시작하세요/);
  assert.match(js, /오늘 무엇을 하시나요\?/);
  assert.match(js, /intentSets/);
  assert.match(js, /quickPaths/);
  assert.match(js, /function rankServices/);
  assert.match(js, /slice\(0, limit\)/);
  assert.match(js, /dataset\.livingGateway = 'v4-hook-first'/);
  assert.match(js, /daily-connect intent-panel/);
  assert.match(css, /\.daily-connect\{/);
  assert.match(css, /\.intent-results/);
  assert.match(css, /\.quick-paths/);
  assert.match(css, /grid-template-columns:minmax\(0,1\.08fr\) minmax\(340px,\.92fr\)/);
});

test('hook-first gateway keeps recommendations compact and expands only after user intent', () => {
  assert.match(js, /data-service-status|dataset\.serviceStatus/);
  assert.match(js, /renderRecommendations/);
  assert.match(js, /limit = 3/);
  assert.match(js, /results\.hidden = true/);
  assert.match(js, /results\.hidden = false/);
  assert.match(js, /buildQuickLinks/);
  assert.match(js, /무료로 시작/);
  assert.doesNotMatch(js, /data-status-filter/);
  assert.doesNotMatch(js, /function applyFilter/);
});

test('homepage language selector supports and persists Korean English Chinese and Japanese', () => {
  assert.match(js, /ekodi\.locale/);
  assert.match(js, /localStorage\.setItem\('ekodi\.locale'/);
  assert.match(js, /'ko-KR'/);
  assert.match(js, /'zh-CN'/);
  assert.match(js, /code:'en'/);
  assert.match(js, /code:'ja'/);
  assert.match(js, /한국어/);
  assert.match(js, /English/);
  assert.match(js, /中文\(简体\)/);
  assert.match(js, /日本語/);
  assert.match(js, /data\.ekodiLanguage|dataset\.ekodiLanguage/);
  assert.match(js, /document\.documentElement\.lang = locale/);
  assert.match(js, /@media\(max-width:640px\)/);
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