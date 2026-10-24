import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

// CONTROL-FACTCHAT-INSTITUTION-001 (2026-10-25): the Control command box can answer through the
// Mokpo National University FactChat institution account, on the super-admin playground path only.
test('Control lists the FactChat institution account as an execution target', async () => {
  const html = await read('control.html');
  const select = html.slice(html.indexOf('id="executionTarget"'), html.indexOf('</select>', html.indexOf('id="executionTarget"')));
  assert.match(select, /<option value="factchat-institution">FactChat · 목포대 기관계정<\/option>/);
  assert.match(html, /control\.js\?v=20261025-factchat-institution-v1/);
});

test('the institution target uses the guarded super-admin playground and never the release path', async () => {
  const ui = await read('control.js');
  assert.match(ui, /if\(!releaseMode&&target==='factchat-institution'\)\{await askFactChatInstitution\(message,prior\);return;\}/);
  const fn = ui.slice(ui.indexOf('async function askFactChatInstitution('), ui.indexOf('function historyForAssist('));
  assert.match(fn, /'\/api\/ai-modules\/v1\/providers\/admin\/factchat-institution\/playground'/);
  assert.match(fn, /'x-ekodi-confirm-impact':'factchat-institution-playground'/);
  // Secrets are refused before anything leaves the browser.
  assert.ok(fn.indexOf('EXTERNAL_SECRET_RE.test(message)') < fn.indexOf('await api('));
  assert.match(fn, /\.slice\(-7800\)/);
  const server = await read('ai-provider-control.js');
  assert.match(server, /institution_account_super_admin_required/);
});

test('the shared secret filter blocks credential-looking input', async () => {
  const ui = await read('control.js');
  const re = new Function('return ' + ui.match(/const EXTERNAL_SECRET_RE=(\/.*\/i);/)[1])();
  assert.ok(re.test('키는 sk-abcdefghijklmnop 입니다'));
  assert.ok(re.test('비밀번호: hunter2'));
  assert.ok(!re.test('목포대 FactChat 교육 일정 정리해줘'));
});
