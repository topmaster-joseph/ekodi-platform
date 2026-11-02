import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const script = await readFile(new URL('../church-life-hub.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../church-life-hub.css', import.meta.url), 'utf8');

test('church life hub is publicly reachable from the main shell', () => {
  assert.match(html, /id="life-hub"/);
  assert.match(html, /href="#life-hub"/);
  assert.match(html, /church-life-hub\.css/);
  assert.match(html, /church-life-hub\.js/);
});

test('word, fellowship, memory and witness flow stays present', () => {
  for (const phrase of ['말씀으로 오늘의 나와 우리를 읽기', '오늘, 어떻게 지내고 있나요?', '우리의 시간을 잊지 않도록', '오늘 내가 복음의 증인으로 설 자리']) {
    assert.ok(html.includes(phrase), `missing life-hub phrase: ${phrase}`);
  }
});

test('EKODI Mission is represented as a first-class church activity', () => {
  assert.ok(html.includes('에코디선교회'));
  assert.match(html, /선교 · 섬김 · 후원/);
});

test('private-first records do not require a backend account', () => {
  assert.match(script, /ekodi\.church\.life\.v1/);
  assert.match(script, /localStorage\.setItem/);
  assert.match(script, /navigator\.share/);
  assert.ok(html.includes('서버로 자동 전송하지 않으며'));
  assert.doesNotMatch(html, /로그인해야|회원만 이용|login-required/i);
});

test('life hub uses EKODI Live rather than standalone Jitsi meeting', () => {
  assert.ok(html.includes('href="/live/church/"'));
  assert.ok(html.includes('주일예배·교회 활동 실시간 시청'));
  assert.doesNotMatch(html, /meet\.jit\.si|EKODIChurchLive/);
});

test('life hub styles cover responsive layouts', () => {
  assert.match(css, /\.life-workspace/);
  assert.match(css, /@media \(max-width: 620px\)/);
});
