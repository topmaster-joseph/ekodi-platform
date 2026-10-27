import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

// CONTROL-EXTERNAL-AI-001 (owner request 2026-10-28): choosing ChatGPT, Gemini, Genspark,
// Claude or Qwen opens that service in a new window with the command filled in or copied.
test('external AI targets are labelled as new-window handoffs', async () => {
  const html = await read('control.html');
  for (const [id, label] of [['chatgpt', 'ChatGPT'], ['genspark', 'Genspark'], ['gemini', 'Gemini'], ['claude', 'Claude'], ['qwen', 'Qwen']])
    assert.match(html, new RegExp(`<option value="${id}">${label} · 새 창</option>`));
  assert.match(html, /control\.js\?v=20261028-external-ai-v1/);
});

test('the window opens inside the user gesture, before any network wait, and never auto-sends', async () => {
  const ui = await read('control.js');
  const submit = ui.slice(ui.indexOf('async function submitCommand('));
  const branch = submit.indexOf('if(external){openExternalAi(external,message);');
  assert.ok(branch > 0 && branch < submit.indexOf('await '), 'external branch must run before the first await');
  assert.match(submit, /const external=!releaseMode&&EXTERNAL_AI\[target\];/);
  const fn = ui.slice(ui.indexOf('function openExternalAi('), ui.indexOf('function historyForAssist('));
  assert.ok(fn.indexOf('EXTERNAL_SECRET_RE.test(message)') < fn.indexOf('window.open('), 'secrets are refused before anything leaves');
  assert.match(fn, /if\(popup\)\{try\{popup\.opener=null\}catch\{\}\}/);
  assert.match(fn, /navigator\.clipboard\.writeText\(message\)/);
  assert.match(fn, /자동 전송은 하지 않습니다\./);
  assert.match(fn, /팝업을 허용한 뒤 다시 실행해 주세요/);
});

test('prefill URLs are encoded and only used where the service reads them', async () => {
  const ui = await read('control.js');
  const block = ui.slice(ui.indexOf('const EXTERNAL_AI=Object.freeze({'), ui.indexOf('function openExternalAi('));
  const EXTERNAL_AI = new Function(`return ${block.replace('const EXTERNAL_AI=', '').trim().replace(/;$/, '')}`)();
  assert.equal(EXTERNAL_AI.chatgpt.url('교회 주보 & 일정?'), 'https://chatgpt.com/?q=%EA%B5%90%ED%9A%8C%20%EC%A3%BC%EB%B3%B4%20%26%20%EC%9D%BC%EC%A0%95%3F');
  assert.equal(EXTERNAL_AI.chatgpt.prefill, true);
  assert.equal(EXTERNAL_AI.claude.prefill, 'try');
  for (const id of ['gemini', 'genspark', 'qwen']) {
    assert.equal(EXTERNAL_AI[id].prefill, false, id);
    assert.doesNotMatch(EXTERNAL_AI[id].url('secret plan'), /secret/, `${id} never carries the command in its URL`);
  }
});
