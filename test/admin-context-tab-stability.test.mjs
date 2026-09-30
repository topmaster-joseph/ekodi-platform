import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sidebar = await readFile(new URL('../admin-sidebar.js', import.meta.url), 'utf8');

test('retired contextual top tabs are removed while left navigation owns interaction', () => {
  assert.match(sidebar, /LEFT-NAV-AUTHORITY-006/);
  assert.match(sidebar, /main\?\.querySelector\(':scope>\.admin-context-tabs-shell'\)\?\.remove\(\)/);
  assert.doesNotMatch(sidebar, /function renderContextTabs/);
  assert.doesNotMatch(sidebar, /data-admin-context-section/);
  assert.doesNotMatch(sidebar, /contextClick/);
});
