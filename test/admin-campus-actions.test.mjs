import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const js = await readFile(new URL('../campus-actions.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../campus-actions.css', import.meta.url), 'utf8');
const build = await readFile(new URL('../scripts/build.mjs', import.meta.url), 'utf8');
const shell = await readFile(new URL('../admin-authenticated-shell.js', import.meta.url), 'utf8');

test('Campus first screen renders the full site catalog with direct operational actions', () => {
  assert.match(js, /All EKODI Sites/);
  assert.match(js, /청계면상인회/);
  assert.match(js, /자담치킨 목포대점/);
  assert.match(js, /피자마루 목포대점/);
  assert.match(js, /요거트퍼플 목포대점/);
  assert.match(js, /makeButton\('Manage'/);
  assert.match(js, /makeButton\('Status'/);
  assert.match(js, /link\.textContent = 'Open ↗'/);
});

test('Campus always keeps pre-open platforms visible and prevents dead public links', () => {
  for (const domain of ['my.ekodi.kr', 'ins.ekodi.kr', 'edu.ekodi.kr', 'media.ekodi.kr']) {
    assert.match(js, new RegExp(domain.replaceAll('.', '\\.')));
  }
  assert.match(js, /lifecycle: 'planned'/);
  assert.match(js, /dataset\.siteLifecycle = site\.lifecycle \|\| 'live'/);
  assert.match(js, /stage\.textContent = '오픈 전'/);
  assert.match(js, /button\.textContent = '오픈 전'/);
  assert.match(js, /if \(site\.lifecycle === 'planned'\)/);
  assert.match(css, /\.campus-site-item\.is-planned/);
  assert.match(css, /\.campus-site-stage/);
  assert.match(css, /\.campus-site-planned-action:disabled/);
});

test('Campus includes verified ecosystem services that were missing from the old 20-site view', () => {
  for (const domain of ['author.ekodi.kr', 'work.ekodi.kr', 'energy.ekodi.kr', 'business.ekodi.kr']) {
    assert.match(js, new RegExp(domain.replaceAll('.', '\\.')));
  }
  assert.match(js, /Work & Life/);
  assert.match(js, /운영 중인 사이트와 오픈 전 플랫폼을 함께 보여주며/);
});

test('Campus groups related services into a compact two-column layout', () => {
  for (const group of [
    'Core & Access',
    'Business & Commerce',
    'Community',
    'Client Sites',
    'Knowledge & Content',
    'Communication & Cloud',
    'Work & Life',
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

test('sidebar normalization is idempotent and cannot feed its own MutationObserver forever', () => {
  assert.match(js, /if \(span\.textContent !== '🤝 Affiliates'\) span\.textContent = '🤝 Affiliates'/);
  assert.match(js, /first\.nodeType === Node\.TEXT_NODE && first\.textContent/);
  assert.match(js, /if \(item\.textContent !== '🤝 Affiliates'\) item\.textContent = '🤝 Affiliates'/);
  assert.match(js, /let sidebarQueued = false/);
  assert.match(js, /queueMicrotask\(\(\) =>/);
});

test('Campus action assets are copied for production but loaded only after authentication', () => {
  assert.match(build, /'campus-actions\.css'/);
  assert.match(build, /'campus-actions\.js'/);
  assert.match(build, /admin-authenticated-shell\.js/);
  assert.doesNotMatch(build, /html = html\.replace\('<\/body>', '<script src="campus-actions\.js"/);
  assert.match(shell, /'campus-actions\.css'/);
  assert.match(shell, /'campus-actions\.js'/);
  assert.match(shell, /return Boolean\(token\(\) && app && !app\.hidden\)/);
  assert.match(css, /\.campus-row-actions/);
  assert.match(css, /\.campus-row-action/);
});
