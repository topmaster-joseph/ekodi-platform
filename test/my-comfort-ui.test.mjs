import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const html=read('my/index.html');
const css=read('my/comfort-ui.css');
const hubCss=read('my/hub-shell.css');

test('My EKODI root uses the calm custom landing without duplicate navigation',()=>{
  assert.match(html,/data-ekodi-global-nav="off"/);
  assert.match(html,/data-ekodi-character="off"/);
  assert.match(html,/data-ekodi-footer-profile="inherit"/);
  assert.doesNotMatch(html,/<nav aria-label="주요 메뉴">[^\n]*>오늘/);
  assert.doesNotMatch(html,/<nav aria-label="주요 메뉴">[^\n]*>내 에코디/);
  assert.match(html,/data-my-tab-link="home"[\s\S]*href="#platforms"[\s\S]*href="#activity"[\s\S]*href="#account"/);
  assert.match(html,/id="myHub"/);
  assert.match(html,/MY EKODI · ACTION HUB/);
  assert.match(html,/무엇을 하시겠어요\?/);
  assert.match(html,/hub-shell\.css\?v=20261001-tab-shell-v1/);
  assert.match(html,/class="my-bottom-tabs"/);
  assert.match(html,/id="workspaceCompact"/);
  assert.match(html,/data-my-tab-section="services"/);
  assert.match(hubCss,/\.my-bottom-tabs\{display:none\}/);
  assert.match(hubCss,/@media\(max-width:720px\)/);
  assert.match(hubCss,/\.my-secondary-feature\{display:none\}/);
  assert.match(html,/comfort-ui\.css\?v=20260906-context-home-v1/);
  assert.match(css,/word-break:keep-all/);
});

test('My EKODI keeps signed-in home compact and groups account settings into subtabs',()=>{
  assert.match(hubCss,/body\[data-auth-state="member"\]\[data-active-tab="home"\] \.comfort-hero/);
  assert.match(html,/class="account-subtabs"/);
  for(const tab of ['basic','public','character','security'])assert.match(html,new RegExp(`data-account-tab="${tab}"`));
  assert.match(html,/data-account-panel="public"/);
  assert.match(html,/data-account-panel="character"/);
  assert.match(html,/data-account-panel="security"/);
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
