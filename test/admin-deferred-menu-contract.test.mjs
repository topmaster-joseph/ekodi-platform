import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('deferred Admin access reuses the shared script loader and canonical navigation', async () => {
  const [layout, loader, googleAdmin] = await Promise.all([
    read('admin-menu-layout.js'),
    read('admin-demand-loader.js'),
    read('google-admin-auth.js'),
  ]);

  assert.match(loader, /loadScript,/);
  assert.match(layout, /section==='admins'[\s\S]*load\('google-admin-auth\.js'\)/);
  assert.doesNotMatch(loader, /admins:\{[^\n]*google-admin-auth\.js/);
  assert.match(googleAdmin, /document\.querySelector\('\[data-panel~="admins"\]'\)/);
  assert.match(googleAdmin, /let navButton = nav\.querySelector\('\[data-section="admins"\]'\)/);
  assert.doesNotMatch(googleAdmin, /!content \|\| document\.querySelector\('\[data-section="admins"\]'\)/);
});

test('missing demand contracts cannot recursively click canonical source navigation', async () => {
  const layout = await read('admin-menu-layout.js');
  const fallback = layout.match(/function fallbackDemand\(section\)\{([\s\S]*?)\n\}/)?.[1] || '';
  assert.ok(fallback, 'fallbackDemand contract is missing');
  assert.doesNotMatch(fallback, /\[data-section=/);
  assert.match(layout, /if\(!demandKey\)\{console\.warn\(/);
});
