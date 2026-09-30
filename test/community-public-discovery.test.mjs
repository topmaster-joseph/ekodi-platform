import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [html, css, runtime, workflow] = await Promise.all([
  readFile(new URL('../community/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../community/community-discovery.css', import.meta.url), 'utf8'),
  readFile(new URL('../community/community-enhancements.js', import.meta.url), 'utf8'),
  readFile(new URL('../.github/workflows/deploy-community.yml', import.meta.url), 'utf8'),
]);

test('Community keeps public discovery, locale selection and action auth gating wired', () => {
  for (const marker of ['id="languageMenu"','data-locale="ko-KR"','data-locale="en"','data-locale="zh-CN"','data-locale="ja"']) assert.ok(html.includes(marker));
  assert.ok(html.includes('data-auth-href="/connect/"'));
  assert.ok(css.includes('word-break:keep-all'));
  assert.ok(runtime.includes("closest?.('[data-auth-href]')"));
  assert.ok(!runtime.includes("$$('[data-auth-href]').forEach"));
  assert.ok(runtime.includes("localStorage.setItem('ekodi.locale'"));
  assert.ok(workflow.includes('node --check community/community-enhancements.js'));
});