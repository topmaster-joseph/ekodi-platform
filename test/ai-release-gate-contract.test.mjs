import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function read(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('guarded Worker and Pages releases execute the no-provider gate before promotion', async () => {
  const cases = [
    ['scripts/guarded-worker-release.mjs', 'candidateVersion = uploadCandidate();'],
    ['scripts/guarded-pages-release.mjs', "deploy(target, 'main');"],
  ];

  for (const [file, promotionMarker] of cases) {
    const source = await read(file);
    const gate = source.indexOf('runProviderIndependenceGate();');
    const promotion = source.indexOf(promotionMarker);
    assert.ok(gate >= 0, `${file} must run provider independence gate`);
    assert.ok(promotion >= 0, `${file} must contain a production promotion path`);
    assert.ok(gate < promotion, `${file} must run the provider independence gate before production promotion`);
  }
});
