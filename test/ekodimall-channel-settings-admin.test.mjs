import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read = name => readFile(new URL(`../${name}`, import.meta.url),'utf8');

test('EKODI Mall YouTube settings are tenant-admin configurable', async()=>{
  const [growth,ui,migration,broker,adapter]=await Promise.all([
    read('marketing-growth-worker.js'),read('workspace-admin-page.js'),
    read('migrations/0064_marketing_channel_settings.sql'),read('google-drive-storage-control.js'),read('channel-youtube-adapter.js')
  ]);
  assert.match(migration,/marketing_channel_settings/);
  assert.match(migration,/UCC1MknWOs8BDw2dbq4i9-Zg/);
  assert.match(growth,/channelSettingsRoute/);
  assert.match(growth,/saveChannelSettings/);
  assert.match(growth,/publish_privacy/);
  assert.match(growth,/channels\?part=brandingSettings/);
  assert.match(growth,/=== '에코디몰'/);
  assert.doesNotMatch(growth,/=== '에코디비즈몰'/);
  assert.match(ui,/설정 저장/);
  assert.match(ui,/저장 \+ YouTube 반영/);
  assert.match(ui,/이름·핸들·이미지 설정/);
  assert.match(broker,/auth\/youtube/);
  assert.match(adapter,/auth\/youtube/);
});
