import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../admin-assist-dock.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../admin-assist-dock.css', import.meta.url), 'utf8');

test('admin command home includes the small-business proactive briefing', () => {
  assert.match(source, /소상공인·지역상권의 AI 활용 시장/);
  assert.match(source, /EkodiBiz와 상권활성화 실무/);
  assert.match(source, /ekodiAssistProactive/);
});

test('external AI handoff uses official origins and keeps prompt out of the URL', () => {
  assert.match(source, /https:\/\/chatgpt\.com\//);
  assert.match(source, /https:\/\/gemini\.google\.com\/app/);
  assert.match(source, /https:\/\/chat\.qwen\.ai\//);
  assert.match(source, /copyText\(prompt\)/);
  assert.doesNotMatch(source, /searchParams\.set\([^\n]*prompt/);
});

test('proactive cards have responsive styling', () => {
  assert.match(css, /\.ekodi-assist-proactive/);
  assert.match(css, /@media\(max-width:720px\).*\.ekodi-proactive-card/s);
});
