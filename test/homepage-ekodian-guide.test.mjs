import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('homepage carries the EKODIAN guide inside the hero content flow', () => {
  assert.match(html, /data-ekodi-character-village="homepage-guide-v1"/);
  assert.match(html, /에코디언 · EKODIAN/);
  assert.match(html, /your guide, not the gate/);
  assert.match(html, /role="img" aria-label="에코디 생태계를 안내하는 에코디언"/);

  const copyStart = html.indexOf('<div class="hero-copy">');
  const actions = html.indexOf('<div class="hero-actions">', copyStart);
  const guide = html.indexOf('<aside class="hero-ekodian-scene"', actions);
  const pulse = html.indexOf('<div class="ecosystem-pulse"', guide);
  assert.ok(copyStart >= 0 && actions > copyStart && guide > actions && pulse > guide);
});

test('homepage guide stays non-blocking, responsive, and motion-safe', () => {
  const rule = html.match(/\.hero-ekodian-scene\{([^}]*)\}/)?.[1] || '';
  assert.match(rule, /display:grid/);
  assert.doesNotMatch(rule, /position:(?:fixed|absolute)/);
  assert.match(html, /@media\(max-width:640px\)[\s\S]*?\.hero-ekodian-scene\{/);
  assert.match(html, /@media\(prefers-reduced-motion:reduce\)[\s\S]*?\.ekodian-wave\{animation:none!important\}/);
});
