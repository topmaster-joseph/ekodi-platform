import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const layoutSource = () => readFile(new URL('../admin-menu-layout.js', import.meta.url), 'utf8');
const demandSource = () => readFile(new URL('../admin-demand-loader.js', import.meta.url), 'utf8');

test('Demand loading never replays a stale menu click after assets finish', async () => {
  const source = await demandSource();
  assert.match(source, /window\.dispatchEvent\(new CustomEvent\('ekodi-nav-changed'/);
  assert.doesNotMatch(source, /real\.click\(\)/);
  assert.doesNotMatch(source, /queueMicrotask\(\(\) => real\.click/);
});

test('Admin layout drops stale async completions instead of reopening an earlier panel', async () => {
  const source = await layoutSource();
  assert.match(source, /if\(requestedSection!==section\)return;\s*applyOrder\(\)/);
  assert.match(source, /await sitesLoading;if\(requestedSection!=='sites'\)return/);
  assert.match(source, /await cheonggyeLoading;if\(requestedSection!=='cheonggye-members'\)return/);
  assert.match(source, /if\(requestedSection!=='common-services'\)return/);
  assert.match(source, /if\(requestedSection===section\)fallbackDemand\(section\)/);
  assert.match(source, /if\(real&&!real\.dataset\.demandFeature\)real\.click\(\)/);
  assert.match(source, /queueMicrotask\(\(\)=>\{if\(requestedSection===section\)activatePanel\(section\);\}\)/);
});
