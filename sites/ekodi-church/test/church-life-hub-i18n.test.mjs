import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const fallback = await readFile(new URL('../church-life-hub-i18n.js', import.meta.url), 'utf8');
const sourceState = await readFile(new URL('../church-life-hub-i18n-state.js', import.meta.url), 'utf8');

test('life hub multilingual scripts load around the shared church i18n layer', () => {
  const statePos = html.indexOf('church-life-hub-i18n-state.js');
  const basePos = html.indexOf('church-i18n.js');
  const fallbackPos = html.indexOf('church-life-hub-i18n.js');
  assert.ok(statePos > -1 && basePos > -1 && fallbackPos > -1);
  assert.ok(statePos < basePos, 'source capture must load before the base translation layer');
  assert.ok(fallbackPos > basePos, 'fallback translation must run after the base translation layer');
});

test('hero keeps the established multilingual continuity phrase', () => {
  assert.match(html, /부르심에서 교제로,/);
  assert.match(html, /hero-continuity/);
});

test('new life hub has non-Korean fallbacks for core community experiences', () => {
  for (const source of [
    '말씀으로 오늘의 나와 우리를 읽기',
    '오늘, 어떻게 지내고 있나요?',
    '우리의 시간을 잊지 않도록',
    '오늘 내가 복음의 증인으로 설 자리',
    '에코디선교회'
  ]) {
    assert.ok(fallback.includes(`'${source}'`), `missing multilingual fallback: ${source}`);
  }
});

test('Korean source text can be restored after locale switching', () => {
  assert.match(sourceState, /const textSource = new WeakMap\(\)/);
  assert.match(sourceState, /const attrSource = new WeakMap\(\)/);
  assert.match(sourceState, /requestAnimationFrame\(restore\)/);
});
