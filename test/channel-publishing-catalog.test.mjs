import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHANNEL_AUTOMATION_TARGET_IDS,
  CHANNEL_PUBLISHING_TARGET_IDS,
  channelCatalogSnapshot,
  channelRegistryMapping,
  channelTargetFromRegistry,
  channelTargetOptions,
} from '../channel-publishing-catalog.js';

test('shared publishing catalog exposes the user-facing channel targets and formats', () => {
  for (const id of ['youtube','instagram','facebook','threads','naver_blog','tiktok','kakao_channel']) {
    assert.ok(CHANNEL_PUBLISHING_TARGET_IDS.includes(id), `missing ${id}`);
  }
  const byId=Object.fromEntries(channelTargetOptions().map(target=>[target.id,target]));
  assert.ok(byId.instagram.formats.some(format=>format.id==='reels'&&format.label==='Reels'));
  assert.ok(byId.instagram.formats.some(format=>format.id==='stories'));
  assert.ok(byId.youtube.formats.some(format=>format.id==='shorts'));
  assert.ok(byId.facebook.formats.some(format=>format.id==='reels'));
  assert.ok(byId.tiktok.formats.some(format=>format.id==='photo'));
});

test('registry mapping is provider + service specific instead of collapsing Meta channels', () => {
  assert.deepEqual(channelRegistryMapping('instagram'),{provider:'meta',serviceKey:'instagram',connectionMode:'oauth'});
  assert.deepEqual(channelRegistryMapping('facebook'),{provider:'meta',serviceKey:'facebook',connectionMode:'oauth'});
  assert.deepEqual(channelRegistryMapping('naver_blog'),{provider:'naver',serviceKey:'blog',connectionMode:'official_handoff'});
  assert.equal(channelTargetFromRegistry({provider:'meta',serviceKey:'instagram'}),'instagram');
  assert.equal(channelTargetFromRegistry({provider:'meta',serviceKey:'facebook'}),'facebook');
  assert.equal(channelTargetFromRegistry({provider:'naver',serviceKey:'blog'}),'naver_blog');
  assert.equal(channelTargetFromRegistry({provider:'tiktok',serviceKey:'content'}),'tiktok');
  assert.equal(channelTargetFromRegistry({provider:'kakao',serviceKey:'channel'}),'kakao_channel');
});

test('catalog does not pretend unsupported automation is available', () => {
  assert.ok(CHANNEL_AUTOMATION_TARGET_IDS.includes('youtube'));
  assert.ok(CHANNEL_AUTOMATION_TARGET_IDS.includes('instagram'));
  assert.ok(CHANNEL_AUTOMATION_TARGET_IDS.includes('facebook'));
  assert.ok(CHANNEL_AUTOMATION_TARGET_IDS.includes('threads'));
  assert.ok(!CHANNEL_AUTOMATION_TARGET_IDS.includes('naver_blog'));
  assert.ok(!CHANNEL_AUTOMATION_TARGET_IDS.includes('tiktok'));
  assert.ok(!CHANNEL_AUTOMATION_TARGET_IDS.includes('kakao_channel'));
  const snapshot=Object.fromEntries(channelCatalogSnapshot({youtubeConfigured:true,metaConfigured:false,threadsConfigured:false}).map(target=>[target.id,target]));
  assert.equal(snapshot.youtube.state,'ready');
  assert.equal(snapshot.instagram.state,'platform_setup_required');
  assert.equal(snapshot.tiktok.state,'adapter_setup_required');
  assert.equal(snapshot.naver_blog.state,'official_handoff');
  assert.match(snapshot.naver_blog.limitation,/2020-05-06|종료/);
});
