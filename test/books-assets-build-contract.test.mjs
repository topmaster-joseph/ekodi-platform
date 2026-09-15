import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

test('Books assets UI is bundled into the secured lazy Books operations assets', async () => {
  const build = await read('scripts/build.mjs');
  for (const marker of ['books-assets-admin.css', 'books-assets-admin.js', 'assetsCss', 'assetsJs']) {
    assert.ok(build.includes(marker), `missing assets build marker: ${marker}`);
  }
});
