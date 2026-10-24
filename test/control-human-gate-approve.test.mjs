import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

// Observed 2026-10-25 on /admin Control: the preflight reply printed literal "\n",
// and a Human-Gate-blocked task offered no way to approve it from the console.
test('the AI route preflight reply uses real line breaks', async () => {
  const ui = await read('control.js');
  const preview = ui.slice(ui.indexOf('async function previewAiRoute()'), ui.indexOf('async function submitCommand('));
  assert.ok(preview.includes("'AI 실행 경로 사전 점검 (실행되지 않음)\\n'"));
  assert.doesNotMatch(preview, /\\\\n/);
});

test('a blocked orchestrator task is approved in place against the live gate version', async () => {
  const ui = await read('control.js');
  assert.match(ui, /data-approve-task="'\+esc\(m\.taskId\)\+'">승인 후 계속<\/button>/);
  assert.match(ui, /m\.taskId&&m\.status==='blocked'&&m\.humanGate!==false/);
  const fn = ui.slice(ui.indexOf('async function approveHumanGate('), ui.indexOf('function historyForAssist('));
  // The state version is always read fresh from the gate list, never from stored history.
  assert.ok(fn.indexOf("/api/control/ai/v8/orchestrator/human-gates?limit=50") < fn.indexOf("/approve'"));
  assert.match(fn, /encodeURIComponent\(taskId\)/);
  assert.match(fn, /JSON\.stringify\(\{expectedStateVersion,note:'Approved from EKODI Control console'\}\)/);
  assert.match(fn, /if\(result\?\.task\?\.approved!==true\)throw/);
  assert.match(fn, /CI·스테이징·운영 검증이 끝나야 완료로 표시됩니다/);
  assert.match(ui, /humanGate:submitted\.humanGate\?\.required===true/);
  assert.match(ui, /Human Gate 승인 대기\. 아래 \[승인 후 계속\]/);
});

test('the approve route stays platform-admin only and the console asset cache is bumped', async () => {
  const [api, html, css] = await Promise.all([read('ai-command-control.js'), read('control.html'), read('control.css')]);
  assert.match(api, /approveOrchestratorTaskForPlatformAdmin\(/);
  assert.match(html, /control\.js\?v=20261025-human-gate-v1/);
  assert.match(css, /CONTROL-HUMAN-GATE-001/);
});
