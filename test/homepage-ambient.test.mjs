import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../homepage-ambient.css', import.meta.url), 'utf8');
const js = await readFile(new URL('../homepage-ambient.js', import.meta.url), 'utf8');
const build = await readFile(new URL('../scripts/build.mjs', import.meta.url), 'utf8');

test('homepage uses a translucent ambient background with one stable Seoul-date scene per day', () => {
  assert.match(css, /body::before/);
  assert.match(css, /backdrop-filter:blur/);
  assert.match(css, /ekodiAmbientDrift/);
  assert.match(css, /ekodiPulseGlow/);
  assert.match(js, /const palettes = \[/);
  assert.match(js, /Asia\/Seoul/);
  assert.match(js, /function dailySeed/);
  assert.match(js, /data\.dailyDate|dataset\.dailyDate/);
  assert.match(js, /--ambient-a/);
  assert.doesNotMatch(js, /crypto\.getRandomValues\(/);
  assert.doesNotMatch(js, /Math\.random\(/);
});

test('ambient layer stays visible above the opaque body background and below content', () => {
  assert.match(css, /body::before,[\s\S]*?z-index:0/);
  assert.match(css, /\.site-header,[\s\S]*?main\{[\s\S]*?z-index:1/);
  assert.doesNotMatch(css, /body::before,[\s\S]*?z-index:-1/);
});

test('living gateway builds a daily focus from the same rendered live service list', () => {
  assert.match(js, /data-service-status/);
  assert.match(js, /data-status-count/);
  assert.match(js, /liveCards/);
  assert.match(js, /is-daily-feature/);
  assert.match(js, /buildDailyPanel/);
  assert.match(js, /TODAY IN EKODI/);
  assert.match(js, /data\.livingGateway|dataset\.livingGateway/);
  assert.doesNotMatch(js, /data-status-filter/);
  assert.doesNotMatch(js, /function applyFilter/);
  assert.doesNotMatch(js, /card\.hidden|group\.hidden|aria-pressed/);
});

test('homepage semi-list keeps service rows compact and mobile-safe', () => {
  assert.match(css, /\.service-grid\{[\s\S]*?grid-template-columns:1fr!important/);
  assert.match(css, /\.service-group\{[\s\S]*?grid-template-columns:190px minmax\(0,1fr\)!important/);
  assert.match(css, /\.service-card\{[\s\S]*?min-height:82px!important/);
  assert.match(css, /@media\(max-width:640px\)/);
  assert.match(css, /\.service-group\{[\s\S]*?grid-template-columns:1fr!important/);
});

test('ambient assets are shipped and injected into the EKODI homepage build', () => {
  assert.match(build, /'homepage-ambient\.css'/);
  assert.match(build, /'homepage-ambient\.js'/);
  assert.match(build, /href="\/homepage-ambient\.css"/);
  assert.match(build, /src="\/homepage-ambient\.js"/);
});