import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const js = await readFile(new URL('../compact-control-center.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../compact-control-center.css', import.meta.url), 'utf8');

test('compact control center keeps Campus as the first screen but renders a simple site table', () => {
  assert.match(js, /dataset\.section = 'campus'/);
  assert.match(js, /EKODI Digital Campus/);
  assert.match(js, /campusServiceRows/);
  assert.match(js, /class="finance-table campus-table"/);
  assert.match(js, /<th>Type<\/th><th>Service<\/th><th>Domain<\/th><th>Manage<\/th>/);
  assert.match(js, /showPanel\('campus'\)/);
  assert.doesNotMatch(js, /Management Preview/);
  assert.doesNotMatch(js, /campusOrbit/);
});

test('site-list rows open public sites and route to related admin sections', () => {
  assert.match(js, /campusServiceRow/);
  assert.match(js, /data\.campusSection|dataset\.campusSection/);
  assert.match(js, /openAdminSection/);
  assert.match(js, /highlightService/);
  assert.match(js, /books\.ekodi\.kr/);
  assert.match(js, /church\.ekodi\.kr/);
  assert.match(js, /mall\.ekodi\.kr/);
  assert.match(js, /link\.target = '_blank'/);
});

test('existing compact table and service-focus styling remain available', () => {
  assert.match(css, /\.campus-panel/);
  assert.match(css, /\.campus-toolbar/);
  assert.match(css, /\.service-control-card\.campus-focus/);
});
