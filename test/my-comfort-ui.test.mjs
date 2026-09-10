import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const html=read('my/index.html');
const css=read('my/comfort-ui.css');

test('My EKODI root uses the calm custom landing without duplicate navigation',()=>{
  assert.match(html,/data-ekodi-global-nav="off"/);
  assert.match(html,/data-ekodi-character="off"/);
  assert.match(html,/data-ekodi-footer-profile="inherit"/);
  assert.doesNotMatch(html,/<nav aria-label="주요 메뉴">[^\n]*>오늘/);
  assert.doesNotMatch(html,/<nav aria-label="주요 메뉴">[^\n]*>내 에코디/);
  assert.match(html,/>홈<\/a><a href="#workspaces">공간<\/a><a href="#recommendations">AI 비서<\/a>/);
  assert.match(html,/comfort-ui\.css\?v=20260906-context-home-v1/);
  assert.match(css,/word-break:keep-all/);
});

test('My EKODI separates customized footer guidance from the shared legal footer',()=>{
  assert.match(html,/class="my-custom-footer"/);
  assert.match(html,/class="my-footer-credo"/);
  assert.doesNotMatch(html,/class="my-footer-common"/);
  assert.match(css,/--ekodi-user-footer-background:/);
  assert.match(css,/\.ekodi-user-ui-footer/);
});

test('My EKODI hero uses CSS-only ambient scenery',()=>{
  assert.doesNotMatch(css,/quiet-field\.svg/);
  assert.match(css,/CSS-only ambient landscape/);
  assert.match(css,/radial-gradient\(ellipse at 91% 111%/);
});
