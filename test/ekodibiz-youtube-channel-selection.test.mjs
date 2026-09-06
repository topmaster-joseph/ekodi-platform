import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('EKODIBIZ YouTube connection binds only the 에코디비즈몰 channel', async () => {
  const source = await readFile(new URL('../marketing-growth-worker.js', import.meta.url), 'utf8');
  assert.match(source, /selectedChannels = discoveredChannels\.filter/);
  assert.match(source, /=== '에코디비즈몰'/);
  assert.match(source, /EKODIBIZ_YOUTUBE_CHANNEL_NOT_FOUND/);
  assert.match(source, /for \(const channel of selectedChannels\)/);
});