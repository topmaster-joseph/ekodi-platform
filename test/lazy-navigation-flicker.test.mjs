import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../control-center-features.js', import.meta.url), 'utf8');

test('lazy navigation hides its placeholder before the real feature button is installed', () => {
  const hideIndex = source.indexOf('button.hidden = true');
  const loadIndex = source.indexOf('await loader()');
  const removeIndex = source.indexOf('removeResolvedPlaceholders()');
  assert.ok(hideIndex >= 0, 'lazy placeholder should be hidden during handoff');
  assert.ok(loadIndex > hideIndex, 'placeholder should be hidden before loading the feature module');
  assert.ok(removeIndex >= 0, 'resolved placeholders should still be removed after install');
  assert.match(source, /button\.hidden = false; button\.disabled = false/);
});
