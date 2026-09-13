import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const runtime=fs.readFileSync('admin-language-status.js','utf8');
const e2e=fs.readFileSync('scripts/admin-authenticated-e2e-menu-worker.mjs','utf8');

test('language status exposes a semantic ready marker after successful render',()=>{
  assert.match(runtime,/dataset\.languageStatusReady='false'/);
  assert.match(runtime,/dataset\.languageStatusReady='true'/);
  assert.match(e2e,/data-language-status-ready/);
  assert.match(e2e,/semantic readiness contract failed/);
  assert.doesNotMatch(e2e,/사용자 화면에는 준비 완료 언어만 표시됩니다/);
});
