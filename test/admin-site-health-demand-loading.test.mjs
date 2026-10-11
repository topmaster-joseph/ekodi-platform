import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { adminMenuOrder } from '../admin-menu-registry.js';

const read = filename => readFileSync(new URL('../' + filename, import.meta.url), 'utf8');

test('site-health has a registered demand path with a real installed panel readiness gate', () => {
  const layout = read('admin-menu-layout.js');
  const loader = read('admin-demand-loader.js');
  const panel = read('site-health-admin.js');

  assert.ok(adminMenuOrder().includes('site-health'));
  assert.match(layout, /\['site-health','site-health'\]/);
  assert.match(loader, /'site-health':\{label:'Site Health'/);
  assert.match(loader, /scripts:\['site-health-admin\.js'\]/);
  assert.match(loader, /ready:'#ekodiGlobalSiteHealth'/);
  assert.match(loader, /real:'\[data-section="site-health"\]'/);
  assert.match(panel, /section\.dataset\.panel=SECTION/);
  assert.match(panel, /section\.id='ekodiGlobalSiteHealth'/);
  assert.match(layout, /if\(requestedSection!==section\)return/);
  assert.match(layout, /queueMicrotask\(\(\)=>\{if\(requestedSection===section\)activatePanel\(section\);\}\)/);
});

// Preserve the authenticated lazy-loader guard independently of postbuild whitespace compaction.
test('site health loads without introducing synthetic administrative permissions or bypasses', () => {
  const loader = read('admin-demand-loader.js');
  assert.match(loader, /if\s*\(!feature\|\|!authenticated\(\)\)\s*return/);
  assert.match(loader, /if\(feature\.ready\)await waitFor\(feature\.ready,1e4\)/);
  assert.doesNotMatch(loader, /ALLOW_UNAUTHENTICATED_SITE_HEALTH/);
});
