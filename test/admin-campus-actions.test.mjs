import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const js = await readFile(new URL('../campus-actions.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../campus-actions.css', import.meta.url), 'utf8');
const build = await readFile(new URL('../scripts/build.mjs', import.meta.url), 'utf8');
const shell = await readFile(new URL('../admin-authenticated-shell.js', import.meta.url), 'utf8');
const demand = await readFile(new URL('../admin-demand-loader.js', import.meta.url), 'utf8');
const postbuild = await readFile(new URL('../scripts/admin-thin-postbuild.mjs', import.meta.url), 'utf8');

test('Campus first screen renders the full site catalog with direct operational actions', () => {
  assert.match(js, /사이트 관리 ·/);
  assert.match(js, /청계면상인회/);
  assert.match(js, /자담치킨 목포대점/);
  assert.match(js, /피자마루 목포대점/);
  assert.match(js, /요거트퍼플 목포대점/);
  assert.match(js, /makeButton\('Manage'/);
  assert.match(js, /makeButton\('Status'/);
  assert.match(js, /link\.textContent = 'Open ↗'/);
});

test('Campus always keeps pre-open platforms visible and prevents dead planned links', () => {
  for (const domain of ['my.ekodi.kr', 'ins.ekodi.kr', 'edu.ekodi.kr', 'media.ekodi.kr']) {
    assert.match(js, new RegExp(domain.replaceAll('.', '\\.')));
  }
  assert.match(js, /lifecycle: 'planned'/);
  assert.match(js, /dataset\.siteLifecycle = site\.lifecycle \|\| 'live'/);
  assert.match(js, /if \(lifecycle === 'planned'\) return '오픈 전'/);
  assert.match(js, /button\.textContent = '오픈 전'/);
  assert.match(js, /if \(site\.lifecycle === 'planned'\)/);
  assert.match(css, /\.campus-site-item\.is-planned/);
  assert.match(css, /\.campus-site-stage/);
  assert.match(css, /\.campus-site-planned-action:disabled/);
});

test('Campus includes verified ecosystem services that were missing from the old view', () => {
  for (const domain of ['author.ekodi.kr', 'work.ekodi.kr', 'energy.ekodi.kr', 'business.ekodi.kr']) {
    assert.match(js, new RegExp(domain.replaceAll('.', '\\.')));
  }
  assert.match(js, /Work & Life/);
  assert.match(js, /에코디 생태계의 전체 사이트와 EKODI\.KR 첫화면 공개 설정을 한 목록에서 관리합니다/);
});

test('Campus reconciles the canonical homepage registry so the two old lists cannot drift', () => {
  assert.match(js, /REGISTRY_GROUP_MAP/);
  assert.match(js, /reconcileRegistryServices/);
  assert.match(js, /normalizeDomain\(service\?\.domain \|\| service\?\.label \|\| service\?\.url\)/);
  assert.match(js, /window\.EKODICampus = Object\.freeze/);
  assert.match(js, /import\('\.\/homepage-admin\.js'\)/);
  assert.match(js, /Other Services/);
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

test('Homepage controls share the same Campus row and remain responsive', () => {
  assert.match(css, /\.campus-homepage-controls/);
  assert.match(css, /\.campus-homepage-notice/);
  assert.match(css, /\.campus-homepage-preview/);
  assert.match(css, /word-break:keep-all/);
  assert.match(css, /@media \(max-width:720px\)/);
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

test('Campus action assets are shipped but fetched only after the administrator opens Campus', () => {
  assert.match(build, /'campus-actions\.css'/);
  assert.match(build, /'campus-actions\.js'/);
  assert.match(build, /'homepage-admin\.js'/);
  assert.doesNotMatch(shell, /'campus-actions\.css'/);
  assert.doesNotMatch(shell, /'campus-actions\.js'/);
  assert.match(demand, /campus:\s*\{/);
  assert.match(demand, /styles: \['campus-actions\.css'\]/);
  assert.match(demand, /scripts: \['campus-actions\.js'\]/);
  assert.match(demand, /return Boolean\(token\(\) && app && !app\.hidden\)/);
  assert.match(postbuild, /On-demand Campus shell/);
  assert.match(postbuild, /section\.id = 'campusPanel'/);
  assert.match(css, /\.campus-row-actions/);
  assert.match(css, /\.campus-row-action/);
});
