import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const js = await readFile(new URL('../compact-control-center.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../compact-control-center.css', import.meta.url), 'utf8');

test('compact control center installs Campus as the visual first screen', () => {
  assert.match(js, /dataset\.section = 'campus'/);
  assert.match(js, /EKODI Digital Campus/);
  assert.match(js, /Management Preview/);
  assert.match(js, /showPanel\('campus'\)/);
  assert.match(js, /#operations/);
});

test('Campus routes public-site areas to related admin sections', () => {
  assert.match(js, /data-campus-section/);
  assert.match(js, /openAdminSection/);
  assert.match(js, /highlightService/);
  assert.match(js, /books\.ekodi\.kr/);
  assert.match(js, /church\.ekodi\.kr/);
  assert.match(js, /mall\.ekodi\.kr/);
});

test('Campus keeps release health and staging guard visible', () => {
  assert.match(js, /PLATFORM HEALTH/);
  assert.match(js, /protected change branch/);
  assert.match(js, /Staging → AI checks → verification → production switch/);
  assert.match(css, /\.campus-health-rail/);
  assert.match(css, /\.campus-preview-shell/);
  assert.match(css, /\.service-control-card\.campus-focus/);
});
