import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('EKODIBIZ YouTube connection preserves every channel returned by the selected Google account', async () => {
  const source = await readFile(new URL('../marketing-growth-worker.js', import.meta.url), 'utf8');
  assert.match(source, /const selectedChannels = discoveredChannels/);
  assert.match(source, /YOUTUBE_CHANNEL_NOT_FOUND/);
  assert.doesNotMatch(source, /selectedChannels = discoveredChannels\.filter/);
  assert.doesNotMatch(source, /EKODIMALL_YOUTUBE_CHANNEL_NOT_FOUND/);
  assert.match(source, /for \(const channel of selectedChannels\)/);
});
