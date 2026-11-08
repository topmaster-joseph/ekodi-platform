import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('native Chromium verification uses Playwright-compatible Ubuntu runner and does not bypass browser tests',async()=>{
  const workflow=await readFile(new URL('../.github/workflows/ekodi-background-browser-worker.yml',import.meta.url),'utf8');
  assert.match(workflow,/runtime-smoke:\s*\n\s*needs: contract\s*\n(?:\s*#[^\n]*\n)*\s*runs-on: ubuntu-24\.04/);
  assert.match(workflow,/npm install --no-save --package-lock=false playwright@1\.55\.0/);
  assert.match(workflow,/npx playwright install --with-deps chromium/);
  assert.doesNotMatch(workflow,/runtime-smoke:[\s\S]{0,200}?continue-on-error:\s*true/);
  assert.match(workflow,/verification_lane/);
});
