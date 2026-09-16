import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('independent EKODI Mission preserves natural-language word boundaries', async () => {
  const css = await readFile(new URL('../space/ekodimission.css', import.meta.url), 'utf8');
  for (const marker of ['word-break:keep-all','overflow-wrap:break-word','hyphens:none','[data-ekodi-break-anywhere]']) {
    assert.match(css, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(css, /:where\(code,kbd,samp,.url,.domain,.email,\[data-ekodi-break-anywhere\]\)\{word-break:normal;overflow-wrap:anywhere/);
});
