import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const [layout, mapJs, mapCss, postbuild, principles] = await Promise.all([
  read('admin-menu-layout.js'), read('system-map-admin.js'),
  read('system-map-admin.css'), read('scripts/admin-system-map-postbuild.mjs'),
  read('ADMIN_UI_PRINCIPLES.md'),
]);

test('architecture lazy map owns its CSS loading without expanding the menu runtime', () => {
  assert.match(mapJs, /\(async \(\) => \{/);
  assert.match(mapJs, /const cssPath='\/system-health-admin\.css'/);
  assert.match(mapJs, /await new Promise\(\(resolve,reject\)=>\{/);
  assert.match(mapJs, /link\.addEventListener\('load',resolve/);
  assert.match(mapJs, /dataset\.architectureLoadError='true'/);
  assert.match(postbuild, /\$\{healthCss\}\\n\$\{mapCss\}/);
  assert.match(layout, /if\(section === 'architecture'&&!window\.EKODISystemMap\)import\('\.\/system-health-admin\.js'\)/);
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
