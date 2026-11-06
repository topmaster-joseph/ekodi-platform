import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const VERIFIER = 'scripts/verify-independent-board-live.mjs';

test('independent board live-verifier changes dispatch the protected Site Core release in both token-mediated merge lanes', async () => {
  const [converge, recovery] = await Promise.all([
    read('scripts/converge-orchestrated-pr-merge.mjs'),
    read('scripts/recover-release-provenance.mjs'),
  ]);
  const convergeStart = converge.indexOf('const sharedSiteTouched=changedFiles.some(file=>');
  const convergeEnd = converge.indexOf('const churchPagesTouched=', convergeStart);
  assert.ok(convergeStart >= 0 && convergeEnd > convergeStart);
  const convergeOwner = converge.slice(convergeStart, convergeEnd);

  const recoveryStart = recovery.indexOf('const sharedSiteTouched=sourceFiles.some(file=>');
  const recoveryEnd = recovery.indexOf('const shellRuntimeTouched=', recoveryStart);
  assert.ok(recoveryStart >= 0 && recoveryEnd > recoveryStart);
  const recoveryOwner = recovery.slice(recoveryStart, recoveryEnd);

  assert.ok(convergeOwner.includes("'" + VERIFIER + "'"), 'convergent merge must dispatch guarded Site Core');
  assert.ok(recoveryOwner.includes("'" + VERIFIER + "'"), 'exact-SHA recovery must dispatch guarded Site Core');
});

test('private Cheonggye 404 and no-store guard remain in the post-promotion verifier', async () => {
  const verifier = await read(VERIFIER);
  assert.match(verifier, /CHEONGGYE_PUBLICATION_HOLD/);
  assert.match(verifier, /const held=await request\(path,\[404\]\)/);
  assert.match(verifier, /regional-private-hold/);
  assert.match(verifier, /private no-store/);
  assert.match(verifier, /private noindex/);
});
