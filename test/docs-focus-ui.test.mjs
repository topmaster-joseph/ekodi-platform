import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const html=read('my/docs/index.html');
const css=read('my/docs/docs-focus.css');
const focus=read('my/docs/docs-focus.js');

test('Docs opens with the document canvas dominant and auxiliary panels closed',()=>{
  assert.match(html,/class="docs-focus library-collapsed ai-collapsed"/);
  assert.match(html,/id="toggleLibrary"/);
  assert.match(html,/id="toggleAi"/);
  assert.match(html,/id="panelBackdrop"/);
  assert.match(html,/docs-focus\.css\?v=20260909-focus-1/);
  assert.match(html,/docs-focus\.js\?v=20260909-focus-1/);
  assert.doesNotMatch(html,/MR 재생|공간 선택/);
});

test('Docs side panels are overlay drawers and do not consume editor width',()=>{
  assert.match(css,/--ekodi-docs-paper-max:1180px/);
  assert.match(css,/body\.docs-focus \.workspace-shell\{[\s\S]*display:block/);
  assert.match(css,/body\.docs-focus \.library-panel,[\s\S]*body\.docs-focus \.ai-panel\{[\s\S]*position:fixed!important/);
  assert.match(css,/translateX\(calc\(-100% - 20px\)\)/);
  assert.match(css,/translateX\(calc\(100% \+ 20px\)\)/);
  assert.match(css,/width:min\(var\(--ekodi-docs-paper-max\),100%\)!important/);
});

test('Docs focus preferences default closed and Escape restores focus',()=>{
  assert.match(focus,/const KEY='ekodi\.docs\.panels\.v1'/);
  assert.match(focus,/DEFAULTS=\{libraryCollapsed:true,aiCollapsed:true\}/);
  assert.match(focus,/event\.key==='Escape'/);
  assert.match(focus,/classList\.add\('library-collapsed','ai-collapsed'\)/);
  assert.match(focus,/ekodi:docs-focus-ready/);
});
