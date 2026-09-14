import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [registry, build] = await Promise.all([
  readFile(new URL('../admin-menu-registry.js', import.meta.url), 'utf8'),
  readFile(new URL('../scripts/build.mjs', import.meta.url), 'utf8'),
]);

test('every local static dependency of the admin menu registry is published as a build asset', () => {
  const assetBlock = build.match(/const assets = \[([\s\S]*?)\n\];/)?.[1] || '';
  assert.ok(assetBlock, 'scripts/build.mjs asset registry must be detectable');

  const dependencies = [...registry.matchAll(/^import\s+(?:[^'"\n]+\s+from\s+)?['"]\.\/([^'"]+)['"];?/gm)]
    .map(match => match[1]);
  assert.ok(dependencies.length > 0, 'admin-menu-registry.js must expose its static local dependencies');

  for (const dependency of dependencies) {
    assert.ok(
      assetBlock.includes(`'${dependency}'`) || assetBlock.includes(`"${dependency}"`),
      `admin menu static dependency must be copied to dist: ${dependency}`,
    );
  }
});
