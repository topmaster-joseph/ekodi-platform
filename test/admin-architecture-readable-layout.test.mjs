import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const [layout, mapJs, mapCss, postbuild, principles] = await Promise.all([
  read('admin-menu-layout.js'), read('system-map-admin.js'),
  read('system-map-admin.css'), read('scripts/admin-system-map-postbuild.mjs'),
  read('ADMIN_UI_PRINCIPLES.md'),
]);

test('architecture direct route loads the CSS bundle before the JS bundle', () => {
  assert.match(layout, /function ensureArchitectureAssets\(/);
  assert.match(layout, /const path='\/system-health-admin\.css'/);
  assert.match(layout, /architectureAssetPromise=styles\.then\(\(\)=>import\('\.\/system-health-admin\.js'\)\)/);
  assert.match(layout, /if\(section==='architecture'\)void ensureArchitectureAssets\(\)/);
  assert.match(layout, /data\.architectureLoadError='true'/);
  assert.match(postbuild, /\$\{healthCss\}\\n\$\{mapCss\}/);
});

test('system structure exposes keyboard-accessible, canonical-URL-preserving shortcuts', () => {
  for (const id of ['structureFlow','structureLayers','structureServiceRegistry','ekodiArchitectureMap']) {
    assert.match(mapJs, new RegExp('data-structure-jump="' + id + '"'));
  }
  assert.match(mapJs, /scrollIntoView\(/);
  assert.doesNotMatch(mapJs, /location\.hash\s*=/);
  assert.match(principles, /ADMIN-LEFT-FLAT-MENU-001/);
});

test('readable system structure uses scoped layout and responsive reflow, never global menu changes', () => {
  assert.match(mapCss, /ADMIN-ARCHITECTURE-READABLE-20261028/);
  assert.match(mapCss, /\.content > \.architecture\[data-panel~="architecture"\]/);
  assert.match(mapCss, /max-inline-size:none!important/);
  assert.match(mapCss, /word-break:keep-all/);
  assert.match(mapCss, /@media\(max-width:1220px\)/);
  assert.match(mapCss, /@media\(max-width:760px\)/);
  assert.match(mapCss, /\.structure-section-nav button:focus-visible/);
  assert.doesNotMatch(mapCss, /\.sidebar\{/);
});
