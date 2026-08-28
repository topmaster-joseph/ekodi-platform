import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../homepage-ambient.css', import.meta.url), 'utf8');
const js = await readFile(new URL('../homepage-ambient.js', import.meta.url), 'utf8');
const build = await readFile(new URL('../scripts/build.mjs', import.meta.url), 'utf8');
const deploySiteCore = await readFile(new URL('../.github/workflows/deploy-site-core.yml', import.meta.url), 'utf8');

test('homepage uses a translucent ambient background with one stable Seoul-date scene per day', () => {
  assert.match(css, /body::before/);
  assert.match(css, /backdrop-filter:blur/);
  assert.match(css, /ekodiAmbientDrift/);
  assert.match(css, /ekodiPulseGlow/);
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
test('public homepage is intent-first and does not expose the service directory by default', () => {
  assert.match(js, /오늘 무엇을 하시나요\?/);
  assert.match(js, /intentSets/);
  assert.match(js, /function matchServices/);
  assert.match(js, /slice\(0, limit\)/);
  assert.match(js, /모든 서비스 보기/);
  assert.match(js, /data\.livingGateway|dataset\.livingGateway/);
  assert.match(js, /v3-intent-first/);
  assert.match(css, /\.service-grid,\.ecosystem,\.lower-grid\{display:none!important\}/);
  assert.match(css, /\.intent-panel/);
  assert.match(css, /\.intent-results/);
});

test('living gateway keeps only high-value recommendations in the first view', () => {
  assert.match(js, /data-service-status/);
  assert.match(js, /liveCards/);
  assert.match(js, /is-daily-feature/);
  assert.match(js, /buildDailyPanel/);
  assert.match(js, /renderRecommendations/);
  assert.match(js, /limit = 3/);
  assert.doesNotMatch(js, /data-status-filter/);
  assert.doesNotMatch(js, /function applyFilter/);
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
