import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../homepage-ambient.css', import.meta.url), 'utf8');
const js = await readFile(new URL('../homepage-ambient.js', import.meta.url), 'utf8');
const build = await readFile(new URL('../scripts/build.mjs', import.meta.url), 'utf8');

test('homepage uses a translucent ambient background that changes per visit', () => {
  assert.match(css, /body::before/);
  assert.match(css, /backdrop-filter:blur/);
  assert.match(css, /ekodiAmbientDrift/);
  assert.match(css, /ekodiPulseGlow/);
  assert.match(js, /const palettes = \[/);
  assert.match(js, /getRandomValues/);
  assert.match(js, /--ambient-a/);
});

test('ambient layer stays visible above the opaque body background and below content', () => {
  assert.match(css, /body::before,[\s\S]*?z-index:0/);
  assert.match(css, /\.site-header,[\s\S]*?main\{[\s\S]*?z-index:1/);
  assert.doesNotMatch(css, /body::before,[\s\S]*?z-index:-1/);
});

test('homepage lifecycle controls filter cards and keep category counts in sync', () => {
  assert.match(js, /data-status-filter/);
  assert.match(js, /data-service-status/);
  assert.match(js, /data-status-count/);
  assert.match(js, /function applyFilter/);
  assert.match(js, /card\.hidden/);
  assert.match(js, /group\.hidden/);
  assert.match(js, /aria-pressed/);
  for (const status of ['live', 'beta', 'preparing', 'planned']) {
    assert.match(js, new RegExp(`['"]${status}['"]`));
  }
});

test('ambient assets are shipped and injected into the EKODI homepage build', () => {
  assert.match(build, /'homepage-ambient\.css'/);
  assert.match(build, /'homepage-ambient\.js'/);
  assert.match(build, /href="\/homepage-ambient\.css"/);
  assert.match(build, /src="\/homepage-ambient\.js"/);
});
