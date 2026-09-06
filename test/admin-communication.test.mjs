import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const text = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('communication registry entry has an operational demand-loaded panel', async () => {
  const [registry, loader, layout, module] = await Promise.all([
    text('admin-menu-registry.js'), text('admin-demand-loader.js'), text('admin-menu-layout.js'), text('communication-admin.js')
  ]);
  assert.match(registry, /id: 'communication'/);
  assert.doesNotMatch(loader, /comm:\{scripts:\['communication-admin\.js'/);
  assert.match(layout, /section==='communication'\)return import\('\.\/communication-admin\.js'\)/);
  assert.match(layout, /#communication:communication/);
  assert.match(layout, /communication:#communication/);
  assert.match(module, /communication-admin\.css/);
  assert.match(module, /dataset\.panel = SECTION/);
  assert.match(module, /https:\/\/mail\.ekodi\.kr\/admin/);
  assert.match(module, /https:\/\/live\.ekodi\.kr\//);
});
