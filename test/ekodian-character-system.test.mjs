import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../shell/character-system.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../shell/user-ui-shell.css', import.meta.url), 'utf8');

test('EKODIAN exposes the shared identity and eight experience traits', () => {
  assert.match(source, /koreanName:'에코디언'/);
  for (const trait of ['proactive','personalized','future-oriented','relationship-oriented','context-aware','companion','restrained','life-giving']) {
    assert.ok(source.includes(`'${trait}'`), `missing EKODIAN trait: ${trait}`);
  }
});

test('EKODIAN stays provider-independent and preserves user choice', () => {
  assert.doesNotMatch(source, /openai|gemini|claude|anthropic/i);
  assert.match(source, /ekodi:ekodian-action/);
  assert.match(source, /scrollIntoView/);
  assert.doesNotMatch(source, /target\.click\(/);
});

test('EKODIAN adapts to service context without occupying admin surfaces', () => {
  for (const id of ['ekodi','my','try','church','mall','marketing','biz','community']) assert.ok(source.includes(`${id}:`));
  assert.match(source, /ALLOWED=new Set\(\['public','workspace'\]\)/);
  assert.match(css, /EKODIAN Experience v2/);
  assert.match(css, /prefers-reduced-motion/);
});
