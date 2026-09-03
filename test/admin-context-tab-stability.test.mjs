import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sidebar = await readFile(new URL('../admin-sidebar.js', import.meta.url), 'utf8');

test('context tab nodes stay stable while only the selected section changes', () => {
  assert.match(sidebar, /const signature = `\$\{locale\}\|\$\{group\}\|\$\{ids\.join\(','\)\}`/);
  assert.doesNotMatch(sidebar, /const signature = `\$\{locale\}\|\$\{group\}\|\$\{section\}\|/);
  assert.match(sidebar, /if \(tabs\.dataset\.renderSignature !== signature\)/);
  assert.match(sidebar, /tabs\.replaceChildren\(\.\.\.nodes\)/);
  assert.match(sidebar, /for \(const button of tabs\.querySelectorAll\('\[data-admin-context-section\]'\)\)/);
  assert.match(sidebar, /button\.dataset\.adminContextSection === section/);
  assert.match(sidebar, /button\.setAttribute\('aria-selected', selected \? 'true' : 'false'\)/);
});
