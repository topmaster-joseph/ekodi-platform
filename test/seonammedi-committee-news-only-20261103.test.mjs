import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../sites/seonammedi/public/', import.meta.url);
const [html, css, app] = await Promise.all(['index.html', 'app.css', 'app.js'].map(f => readFile(new URL(f, root), 'utf8')));

test('committee view shows only 비상대책위 활동소식 while records stay in the DOM', () => {
  assert.match(html, /<section id="committee-activity" class="[^"]*\bcommittee-news-only\b/);
  for (const id of ['committeeActivityList', 'committeeActivityFilters', 'committeeActivityForm', 'committeeActivityManageToggle']) {
    assert.ok(html.includes(`id="${id}"`), id);
    assert.match(css, new RegExp(`#committee-activity\\.committee-news-only #${id}`));
  }
  assert.match(css, /#committee-activity\.committee-news-only \.committee-toolbar/);
  assert.match(css, /display:none!important/);
});

test('heading and labels read 비상대책위 활동소식', () => {
  assert.match(html, /<h3 id="committeeNewsTitle">비상대책위 활동소식<\/h3>/);
  assert.ok(!html.includes('비상대책위 관련소식'));
  assert.ok(!app.includes('비상대책위 관련소식'));
});
