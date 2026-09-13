import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

for (const workflow of [
  '.github/workflows/deploy-site-core.yml',
  '.github/workflows/stage-shared-site-shell.yml',
]) {
  test(`${workflow} can verify merged-PR provenance during release`, async () => {
    const source = await read(workflow);
    assert.match(source, /permissions:\s*[\s\S]*?contents: read\s*[\s\S]*?pull-requests: read/);
    assert.match(source, /validate-ekodi-ai-change-orchestration\.mjs" --release/);
  });
}
