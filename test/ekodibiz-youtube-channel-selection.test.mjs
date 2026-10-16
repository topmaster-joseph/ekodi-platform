import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('EKODIBIZ YouTube connection preserves every channel returned by the selected Google account', async () => {
  const source = await readFile(new URL('../marketing-growth-worker.js', import.meta.url), 'utf8');
  assert.match(source,/selectAuthorizedYouTubeChannels\(channels,\{brandAccountMode,registryConnectionId:state\.registry_connection_id\}\)/);
  const helper=await readFile(new URL('../youtube-brand-channel-verification.js',import.meta.url),'utf8');
  assert.match(helper,/YOUTUBE_CHANNEL_NOT_FOUND/);
  assert.match(helper,/if\(brandAccountMode/);
  assert.doesNotMatch(source, /selectedChannels = discoveredChannels\.filter/);
  assert.doesNotMatch(source, /EKODIMALL_YOUTUBE_CHANNEL_NOT_FOUND/);
  assert.match(source, /for \(const channel of selectedChannels\)/);
});
