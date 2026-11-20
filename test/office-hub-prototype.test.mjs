import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../office-prototype/index.html', import.meta.url), 'utf8');
const js = readFileSync(new URL('../office-prototype/office.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../office-prototype/office.css', import.meta.url), 'utf8');

test('prototype is labeled nonproduction, links only existing canonical entrypoints', () => {
  assert.match(html, /오피스 통합 진입점 · 연결 서비스 제공/);
  assert.match(html, /실제 파일을 열거나 저장하지 않습니다/);
  for (const route of ['/my/docs/', '/proposal/', '/edu/', '/my/']) {
    assert.ok(html.includes('https://ekodi.kr' + route), route);
  }
  for (const match of html.matchAll(/href="(https?:[^"]+)"/g)) {
    assert.equal(new URL(match[1]).hostname, 'ekodi.kr');
  }
  assert.doesNotMatch(html, /office\.ekodi\.kr|구현 완료|지금 다운로드/);
});
test('strict static-only frontend has no credential or file capture features', () => {
  assert.doesNotMatch(html, /<form\b|<input\b|type="file"|<script(?!\s+defer\s+src="\.\/office\.js")/i);
  assert.doesNotMatch(js, /\b(fetch|XMLHttpRequest|localStorage|sessionStorage|document\.cookie|postMessage|sendBeacon)\b/);
  assert.doesNotMatch(js, /innerHTML|eval\s*\(|new Function/);
  assert.doesNotMatch(html, /on(click|load|error|input)=/i);
});
test('accessible three-tab navigation uses aria states, keyboard, and matching panels', () => {
  for (const key of ['personal', 'team', 'desktop']) {
    assert.match(html, new RegExp('id="tab-' + key + '"'));
    assert.match(html, new RegExp('id="panel-' + key + '"'));
    assert.match(html, new RegExp('data-tab="' + key + '"'));
  }
  assert.match(js, /aria-selected/);
  assert.match(js, /ArrowRight/);
  assert.match(js, /ArrowLeft/);
  assert.match(js, /Home/);
  assert.match(js, /End/);
  assert.match(css, /max-width:520px/);
  assert.match(css, /prefers-reduced-motion/);
});
