import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = name => readFile(new URL(`../${name}`, import.meta.url), 'utf8');

test('global Community Admin manages service operations without reviving ministry reports', async () => {
  const [loader, admin, build] = await Promise.all([
    read('admin-demand-loader.js'),
    read('community-admin.js'),
    read('scripts/build.mjs'),
  ]);
  assert.match(loader, /community:\s*\{[^}]*community-admin\.js/);
  assert.doesNotMatch(loader, /community-reports-admin\.js/);
  assert.match(admin, /COMMUNITY · SERVICE OPERATIONS/);
  assert.match(admin, /api\/control\/services/);
  assert.match(admin, /service\.id === 'community'/);
  assert.match(admin, /credentials:'omit'/);
  assert.match(admin, /https:\/\/community\.ekodi\.kr\//);
  assert.match(admin, /https:\/\/ekodi\.kr\/ekodi-church\/admin\/reports/);
  assert.doesNotMatch(admin, /api\/community\/admin\/reports/);
  assert.match(build, /community-admin\.js/);
});
