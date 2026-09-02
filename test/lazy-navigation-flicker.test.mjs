import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../admin-demand-loader.js', import.meta.url), 'utf8');

test('lazy navigation disables its placeholder while loading and removes it only after the real feature resolves', () => {
  const disableIndex = source.indexOf('placeholder.disabled = true');
  const loadIndex = source.indexOf("for (const src of feature.scripts || []) await loadScript(src)");
  const removeIndex = source.indexOf('placeholder !== real && placeholder.isConnected');
  assert.ok(disableIndex >= 0);
  assert.ok(loadIndex > disableIndex);
  assert.ok(removeIndex > loadIndex);
  assert.match(source, /placeholder\.disabled = false/);
  assert.match(source, /placeholder\.classList\.remove\('is-loading'\)/);
});
