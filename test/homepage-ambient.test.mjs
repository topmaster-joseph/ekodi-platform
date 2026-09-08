import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../homepage-ambient.css', import.meta.url), 'utf8');
const js = await readFile(new URL('../homepage-ambient.js', import.meta.url), 'utf8');
const homepage = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const build = await readFile(new URL('../scripts/build.mjs', import.meta.url), 'utf8');
const deploySiteCore = await readFile(new URL('../.github/workflows/deploy-site-core.yml', import.meta.url), 'utf8');

test('homepage keeps a deterministic Seoul-date ambient scene', () => {
  assert.match(css, /body::before/);
  assert.match(css, /backdrop-filter:blur/);
  assert.match(css, /@keyframes ekodiAmbient/);
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

test('public homepage is EKODIAN character-village first', () => {
  assert.match(homepage, /EKODIAN CHARACTER VILLAGE V6/);
  assert.match(homepage, /누구나 시작할 수 있는/);
  assert.match(homepage, /data-ekodi-village-gates/);
  assert.match(homepage, /class="ekodian-guide"/);
  assert.match(js, /gatePriority/);
  assert.match(js, /function buildCharacterVillage/);
  assert.match(js, /visible\.slice\(0, 8\)/);
  assert.match(js, /dataset\.livingGateway = 'v6-character-village'/);
  assert.match(css, /\.village-gate\{/);
  assert.match(css, /\.ekodian-guide\{/);
  assert.match(css, /\.value-grid\{/);
});

test('character village respects verified homepage presentation controls', () => {
  assert.match(js, /data-service-status|dataset\.serviceStatus/);
  assert.match(js, /applyHomepagePresentation/);
  assert.match(js, /homepageDefault/);
  assert.match(js, /visibility === 'hidden'/);
  assert.match(js, /api\/homepage\/presentation/);
  assert.match(js, /visible\.slice\(0, 8\)/);
  assert.doesNotMatch(js, /data-status-filter/);
  assert.doesNotMatch(js, /function applyFilter/);
});

test('character village stays responsive and motion-safe', () => {
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /\.village-gates/);
  assert.match(css, /grid-template-columns:repeat\(2,1fr\)/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
});

test('ambient layer stays behind interface content', () => {
  assert.match(css, /body\{[^}]*isolation:isolate/);
  assert.match(css, /body::before\{[\s\S]*?z-index:-2/);
  assert.match(css, /\.site-header\{[\s\S]*?z-index:50/);
});

test('ambient assets are shipped and injected into the EKODI homepage build', () => {
  assert.match(build, /'homepage-ambient\.css'/);
  assert.match(build, /'homepage-ambient\.js'/);
  assert.match(build, /href="\/homepage-ambient\.css"/);
  assert.match(build, /src="\/homepage-ambient\.js"/);
});
