import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [workflow,worker,build]=await Promise.all([
  readFile(new URL('../.github/workflows/deploy-admin-true-lazy.yml',import.meta.url),'utf8'),
  readFile(new URL('../site-worker.js',import.meta.url),'utf8'),
  readFile(new URL('../scripts/build.mjs',import.meta.url),'utf8'),
]);

test('Canonical Admin release watches Campus action assets and secured Worker ships them',()=>{
  assert.match(workflow, /'campus-actions\.js'/);
  assert.match(workflow, /'campus-actions\.css'/);
  assert.match(worker, /campus-actions\.js/);
  assert.match(worker, /campus-actions\.css/);
  assert.match(build, /campus-actions\.js/);
  assert.match(build, /campus-actions\.css/);
});
