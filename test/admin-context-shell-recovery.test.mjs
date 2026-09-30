import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const recovery = await readFile(new URL('../admin-context-shell-recovery.js', import.meta.url), 'utf8');
const registry = await readFile(new URL('../admin-menu-registry.js', import.meta.url), 'utf8');

test('admin context shell recovery watches only direct app child replacement', () => {
  assert.match(recovery, /querySelector\?\.\(APP_SELECTOR\)/);
  assert.match(recovery, /observer\.observe\(app,\s*\{\s*childList:\s*true,\s*subtree:\s*false\s*\}\)/);
  assert.match(recovery, /window\.EKODIAdminSidebar\?\.sync\?\.\(document\)/);
});

test('admin context shell recovery is browser-guarded and tears down cleanly', () => {
  assert.match(recovery, /typeof window !== 'undefined'/);
  assert.match(recovery, /typeof document !== 'undefined'/);
  assert.match(recovery, /window\.addEventListener\?\.\('pagehide',\s*teardown,\s*\{\s*once:\s*true\s*\}\)/);
  assert.match(recovery, /observer\?\.disconnect\(\)/);
});

test('admin menu registry boots context shell recovery with shared admin runtime', () => {
  assert.match(registry, /admin-context-shell-recovery\.js/);
});
