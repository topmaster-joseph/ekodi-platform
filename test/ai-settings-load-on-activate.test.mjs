import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../ai-management-admin.js', import.meta.url), 'utf8');

test('AI-SETTINGS-LOAD-001: settings load when the panel is activated by menu, detail tab or URL', () => {
  assert.match(source, /addEventListener\('ekodi-admin-section-changed',event=>\{if\(event\?\.detail\?\.section===SECTION&&!snapshot\)load\(\)\}\)/);
  assert.match(source, /function watchPanel\(panel\)/);
  assert.match(source, /observe\(panel,\{attributes:true,attributeFilter:\['class','hidden'\]\}\)/);
  assert.match(source, /function load\(\)\{if\(loading\)return loading;/);
  // Errors before the first render replace the "준비하는 중" placeholder instead of disappearing.
  assert.match(source, /\$\('#aiManagementMessage'\)\|\|\$\('#aiManagementBody \.ai-mgmt-empty'\)/);
});
