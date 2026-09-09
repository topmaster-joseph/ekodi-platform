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

test('public homepage leads with the dynamic EKODI ecosystem experience', () => {
  assert.match(js, /원하는 일, 바로 시작하세요/);
  assert.match(js, /function buildDynamicVisual/);
  assert.match(js, /function buildQuickLaunch/);
  assert.match(js, /dataset\.livingGateway = 'v6-dynamic-ecosystem'/);
  assert.match(js, /ecosystem-orbit ecosystem-orbit-/);
  assert.match(js, /domain-float domain-/);
  assert.match(js, /dynamic-service-launchers/);
  assert.match(css, /EKODI dynamic ecosystem landing v6/);
  assert.match(css, /\.ecosystem-core\{/);
  assert.match(css, /\.ecosystem-orbit\{/);
  assert.match(css, /\.dynamic-start-panel\{/);
  assert.match(css, /body\[data-living-gateway="v6-dynamic-ecosystem"\] #ecosystem\{display:block!important/);
  assert.match(css, /grid-template-columns:minmax\(0,\.92fr\) minmax\(460px,1\.08fr\)/);
});

test('quick launch respects homepage presentation and links only to verified live launch choices', () => {
  assert.match(js, /applyHomepagePresentation/);
  assert.match(js, /cards\.filter\(card => !card\.hasAttribute\('hidden'\)\)/);
  assert.match(js, /\['church','biz','books','lab','work'\]/);
  assert.match(js, /https:\/\/ekodi\.kr\/my\//);
  assert.match(js, /dynamic-more-link/);
  assert.match(js, /무료로 시작하기/);
  assert.doesNotMatch(js, /dataset\.quickService = 'mail'/);
  assert.doesNotMatch(js, /dataset\.quickService = 'live'/);
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
