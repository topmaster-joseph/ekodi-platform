import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read = async path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('devotional control keeps status, action and data regions within responsive admin workspace', async () => {
  const css = await read('devotional-admin.css');
  const js = await read('devotional-admin.js');
  assert.match(js, /devotional-head/);
  assert.match(js, /devotional-summary/);
  assert.match(js, /devotional-channel-grid/);
  assert.match(js, /devotional-table-wrap/);
  assert.match(css, /\.devotional-panel\{[\s\S]*?width:100%;max-width:none/);
  assert.match(css, /\.devotional-table-wrap\{[^}]*overflow-x:auto/);
  assert.match(css, /@media\(max-width:1100px\)/);
  assert.match(css, /@media\(max-width:900px\)/);
  assert.match(css, /@media\(max-width:620px\)/);
  assert.match(css, /@media\(max-width:360px\)/);
  assert.match(css, /word-break:keep-all/);
});

test('social control uses full-width layout and wraps site channel actions', async () => {
  const css = await read('social-admin.css');
  const js = await read('social-admin.js');
  assert.match(js, /social-site-directory-list/);
  assert.match(js, /social-workspace-tabs/);
  assert.match(css, /#socialAdmin\.social-admin\{[\s\S]*?max-width:none!important/);
  assert.match(css, /SOCIAL-ADMIN-LAYOUT-20261114/);
  assert.match(css, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /\.social-site-directory-actions\*?>\*/);
  assert.match(css, /@media\(max-width:390px\)/);
});

test('church Sunday operator keeps server-owned controls and responsive list/editor', async () => {
  const css = await read('church-reports-admin.css');
  const page = await read('church-pastor-admin-page.js');
  assert.match(page, /id="worshipForm"/);
  assert.match(page, /id="churchAiCommand"/);
  assert.match(page, /church-reports-admin\.css\?v=20261114-worship-layout1/);
  assert.match(css, /CHURCH-WORSHIP-LAYOUT-20261114/);
  assert.match(css, /#mainPanel:has\(> #worshipForm\)/);
  assert.match(css, /#worshipForm \.trade-grid/);
  assert.match(css, /@media\(max-width:1180px\)/);
  assert.match(css, /@media\(max-width:680px\)/);
  assert.match(page, /공통본문이 승인되지 않아 자동 준비를 중단/);
  assert.match(page, /is_published:published/);
});
