import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('documents view uses tabs and cards instead of wide tables', () => {
  const js = read('church-reports-admin.js');
  const start = js.indexOf('async function loadDocuments(){');
  const body = js.slice(start, js.indexOf('const ISSUED_API', start));
  assert.ok(body.includes('church-doc-tabs'));
  assert.ok(body.includes('data-doc-tab'));
  assert.ok(body.includes('church-doc-card'));
  assert.ok(body.includes("key:'issued'"));
  assert.ok(!body.includes('<table>'));
  assert.ok(read('church-reports-admin.css').includes('.church-doc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr))'));
  assert.match(read('church-pastor-admin-page.js'), /church-reports-admin\.js\?v=20261109-tabs1/);
});

test('login page asks to continue or switch when a session already exists', () => {
  const js = read('auth-site/client-auth.js');
  assert.ok(js.includes('function askContinueOrSwitch(existing)'));
  assert.ok(js.includes("if(!PREOPENED_BRIDGE){askContinueOrSwitch(existing);return}"));
  assert.ok(js.includes('if(awaitingAccountChoice)return false;'));
  const html = read('auth-site/index.html');
  assert.ok(html.includes('id="continueSignedIn"'));
  assert.ok(html.includes('id="switchAccount"'));
  assert.ok(html.includes('다른 계정으로 로그인'));
});
