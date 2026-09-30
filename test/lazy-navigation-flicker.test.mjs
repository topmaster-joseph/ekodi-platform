import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../admin-demand-loader.js', import.meta.url), 'utf8');

test('demand navigation binds only existing internal controls and never creates primary-sidebar placeholders', () => {
  const start = source.indexOf('function placeholder(key, feature)');
  const end = source.indexOf('function bindBaseEnhancements()', start);
  const block = source.slice(start, end);
  assert.match(block, /const button = nav\.querySelector\(feature\.real\)/);
  assert.match(block, /if \(!button\) return false/);
  assert.doesNotMatch(block, /document\.createElement\('button'\)/);
  assert.doesNotMatch(block, /label\.textContent = feature\.label/);
  assert.match(source, /window\.EKODIAdminSidebar\?\.sync\?\.\(document\)/);
});

test('demand navigation marks existing controls busy before loading and removes stale proxies only after the real control resolves', () => {
  const busyIndex = source.indexOf('placeholder.disabled = true');
  const loadIndex = source.indexOf('for (const src of feature.scripts || []) await loadScript(src)');
  const realIndex = source.indexOf('const real = await waitFor(feature.real)');
  const removeIndex = source.indexOf('placeholder !== real && placeholder.isConnected) placeholder.remove()');
  assert.ok(busyIndex >= 0 && loadIndex > busyIndex, 'placeholder must become busy before primary scripts load');
  assert.ok(realIndex > loadIndex && removeIndex > realIndex, 'placeholder removal must wait for the real control');
  assert.ok(source.includes("placeholder.classList.add('is-loading')"));
  assert.ok(source.includes("placeholder.classList.remove('is-loading')"));
  assert.ok(source.includes('placeholder.disabled = false'));
});
