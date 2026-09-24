import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Admin authenticated shell ships the conversation-first workbench skin', async () => {
  const [shell, build, css, dock, bootstrap, thinPostbuild, menuLayout] = await Promise.all([
    read('admin-authenticated-shell.js'),
    read('scripts/build.mjs'),
    read('admin-conversation-workbench.css'),
    read('admin-assist-dock.js'),
    read('admin-assist-bootstrap.js'),
    read('scripts/admin-thin-postbuild.mjs'),
    read('admin-menu-layout.js'),
  ]);

  assert.doesNotMatch(shell, /admin-conversation-workbench\.css/);
  assert.match(build, /appendOutputSources\('admin-design-engine\.css'/);
  assert.match(build, /path:'admin-conversation-workbench\.css'/);
  assert.match(build, /marker:'EKODI Admin conversation-first workbench v1'/);
  assert.match(build, /admin-conversation-workbench\.css \*\//);
  assert.match(css, /--ekodi-admin-sidebar-width:272px/);
  assert.match(css, /--ekodi-assist-left:272px/);
  assert.doesNotMatch(css, /data-ekodi-admin-ui/);
  assert.match(css, /^body\.admin-compact\{/m);
  assert.match(thinPostbuild, /final visual authority/);
  assert.match(thinPostbuild, /conversationWorkbenchCss/);
  assert.match(css, /\.admin-global-details\{[\s\S]*display:grid!important/);
  assert.match(css, /admin-command-home \.admin-context-tabs-shell\{[\s\S]*display:none!important/);
  assert.match(css, /not\(\.admin-command-home\) \.admin-context-tabs-shell\{[\s\S]*display:flex!important/);
  assert.match(css, /\.admin-command-entry\{[\s\S]*background:#e8f0fe!important/);
  assert.match(css, /admin-command-home\.admin-command-active \.ekodi-assist-rail\{[\s\S]*display:none!important/);
  assert.match(css, /admin-command-home\.admin-command-active \.ekodi-assist-quick\{[\s\S]*display:none!important/);
  assert.match(css, /body\.admin-compact \.ekodi-assist-bootstrap-form/);
  assert.match(css, /\[data-panel\]\[data-admin-list-layout="single"\]/);
  assert.match(css, /grid-template-columns:minmax\(0,1fr\)!important/);
  assert.match(menuLayout, /dataset\.adminListLayout='single'/);
  assert.match(dock, /무엇을 관리하거나 실행할까요\?/);
  assert.match(dock, /placeholder="에코디와 대화하기"/);
  assert.match(bootstrap, /placeholder="에코디와 대화하기"/);
});

test('Admin conversation-first skin preserves mobile drawer and readable light surface', async () => {
  const css = await read('admin-conversation-workbench.css');
  assert.match(css, /color-scheme:light/);
  assert.match(css, /background:var\(--ekodi-admin-sidebar\)!important/);
  assert.match(css, /html body\.admin-compact\.ekodi-admin-design-engine\{/);
  assert.match(css, /html body\.admin-compact\.ekodi-admin-design-engine \.sidebar\{[\s\S]*width:272px!important[\s\S]*background:#f7f8fc!important/);
  assert.match(css, /html body\.admin-compact\.ekodi-admin-design-engine\.admin-command-home\.admin-command-active \.ekodi-assist\{[\s\S]*left:272px!important/);
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /\.sidebar\.open/);
  assert.match(css, /box-shadow:18px 0 54px/);
  assert.match(css, /top:56px!important/);
  assert.match(css, /margin:48px auto 0!important/);
});
