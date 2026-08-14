import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const js = await readFile(new URL('../campus-actions.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../campus-actions.css', import.meta.url), 'utf8');
const build = await readFile(new URL('../scripts/build.mjs', import.meta.url), 'utf8');

test('Campus first screen renders the full operational site list with three direct actions', () => {
  assert.match(js, /All EKODI Sites/);
  assert.match(js, /청계면상인회/);
  assert.match(js, /자담치킨 목포대점/);
  assert.match(js, /피자마루 목포대점/);
  assert.match(js, /요거트퍼플 목포대점/);
  assert.match(js, /makeButton\('Manage'/);
  assert.match(js, /makeButton\('Status'/);
  assert.match(js, /link\.textContent = 'Open ↗'/);
});

test('Campus groups related services into a compact two-column layout', () => {
  for (const group of [
    'Core & Access',
    'Business & Commerce',
    'Community',
    'Client Sites',
    'Knowledge & Content',
    'Communication & Cloud',
  ]) assert.match(js, new RegExp(group.replaceAll('&', '\\&')));
  assert.match(js, /className = 'campus-groups-grid'/);
  assert.match(js, /className = 'campus-group-card'/);
  assert.match(js, /className = 'campus-site-item'/);
  assert.match(css, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /\.campus-group-card/);
  assert.match(css, /\.campus-site-item/);
});

test('public site Open links never inherit monitor-only health endpoints', () => {
  assert.match(js, /function publicServiceUrl/);
  assert.match(js, /function normalizeServiceOpenLinks/);
  assert.match(js, /domain === 'api\.ekodi\.kr'/);
  assert.match(js, /open\.href = publicUrl/);
  assert.match(js, /serviceControlGrid/);
});

test('Domains and DNS navigation is removed while Affiliates has a visible icon', () => {
  assert.match(js, /data-section="domains"/);
  assert.match(js, /data-lazy-section="domains"/);
  assert.match(js, /\.forEach\(item => item\.remove\(\)\)/);
  assert.match(js, /🤝 Affiliates/);
});

test('Campus action assets are included in the production build', () => {
  assert.match(build, /'campus-actions\.css'/);
  assert.match(build, /'campus-actions\.js'/);
  assert.match(build, /href="campus-actions\.css"/);
  assert.match(build, /src="campus-actions\.js"/);
  assert.match(css, /\.campus-row-actions/);
  assert.match(css, /\.campus-row-action/);
});
