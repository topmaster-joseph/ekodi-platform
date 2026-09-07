import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const controls = await readFile(new URL('../admin-public-site-controls.js', import.meta.url), 'utf8');

test('public-site controls call the canonical EKODI API origin', () => {
  assert.match(controls, /const API = 'https:\/\/api\.ekodi\.kr\/api\/control\/public-sites';/);
  assert.doesNotMatch(controls, /const API = '\/api\/control\/public-sites';/);
});

test('central Admin navigation refreshes public-site controls when the panel becomes active', async () => {
  const layout = await readFile(new URL('../admin-menu-layout.js', import.meta.url), 'utf8');
  assert.match(layout, /section === 'public-site-controls'\)window\.EKODIPublicSiteControls\?\.load\?\.\(\)/);
});

test('production compact Admin runtime also refreshes public-site controls on activation', async () => {
  const compact = await readFile(new URL('../admin-menu-layout.compact.js', import.meta.url), 'utf8');
  assert.match(compact, /"public-site-controls"===e&&window\.EKODIPublicSiteControls\?\.load\?\.\(\)/);
});
