import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  OWNED_TENANT_AUTOPOST_ROLLOUT,
  autopostChannelCompatible,
  autopostContentEligible,
  ownedTenantAutopostSubject,
} from '../owned-tenant-autopost-loop.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url),'utf8');

test('owned tenant rollout order follows the approved sequence', () => {
  assert.deepEqual(
    OWNED_TENANT_AUTOPOST_ROLLOUT.map(item=>item.subjectKey),
    ['ekodi-biz','jadam','pizzamaru','yogurt']
  );
  assert.equal(OWNED_TENANT_AUTOPOST_ROLLOUT[0].name,'에코디비즈');
  assert.equal(OWNED_TENANT_AUTOPOST_ROLLOUT[1].templateId,'store_promo');
  assert.equal(ownedTenantAutopostSubject({type:'tenant',key:'ekodi-biz'}),true);
  assert.equal(ownedTenantAutopostSubject({type:'tenant',key:'jadam'}),true);
  assert.equal(ownedTenantAutopostSubject({type:'tenant',key:'pizzamaru'}),true);
  assert.equal(ownedTenantAutopostSubject({type:'tenant',key:'yogurt'}),true);
  assert.equal(ownedTenantAutopostSubject({type:'tenant',key:'ekodimall'}),false);
});

test('automatic queueing is fail-closed unless content is explicitly eligible and approved', () => {
  assert.equal(autopostContentEligible({approval_state:'approved',content_json:'{"autopostEligible":true}'}),true);
  assert.equal(autopostContentEligible({approval_state:'auto_approved',content_json:'{"autopostEligible":true}'}),true);
  assert.equal(autopostContentEligible({approval_state:'draft',content_json:'{"autopostEligible":true}'}),false);
  assert.equal(autopostContentEligible({approval_state:'approved',content_json:'{}'}),false);
  assert.equal(autopostContentEligible({approval_state:'approved',content_json:'{"autopostEligible":true,"autopostDisabled":true}'}),false);
});

test('provider compatibility prevents assetless Instagram and YouTube jobs', () => {
  const text={content_type:'social_post',asset_url:''};
  const image={content_type:'social_post',asset_url:'https://example.com/card.jpg'};
  const video={content_type:'short_video',asset_url:'https://example.com/short.mp4'};
  assert.equal(autopostChannelCompatible(text,{provider:'facebook',channel_type:'facebook_page'}),true);
  assert.equal(autopostChannelCompatible(text,{provider:'threads',channel_type:'profile'}),true);
  assert.equal(autopostChannelCompatible(text,{provider:'instagram',channel_type:'instagram_business'}),false);
  assert.equal(autopostChannelCompatible(image,{provider:'instagram',channel_type:'instagram_business'}),true);
  assert.equal(autopostChannelCompatible(image,{provider:'youtube',channel_type:'youtube_short'}),false);
  assert.equal(autopostChannelCompatible(video,{provider:'youtube',channel_type:'youtube_short'}),true);
});

test('migration enables autonomous policy but preserves the explicit content gate in runtime', async () => {
  const [migration,loop] = await Promise.all([
    read('migrations/0093_owned_tenant_autopost_rollout.sql'),
    read('owned-tenant-autopost-loop.js'),
  ]);
  for (const key of ['ekodi-biz','jadam','pizzamaru','yogurt']) {
    assert.ok(migration.includes(`'tenant','${key}','marketing','auto','active'`));
    assert.ok(migration.includes(`'tenant','${key}','autonomous',1`));
    assert.ok(loop.includes(`subjectKey:'${key}'`));
  }
  assert.match(loop,/autopostEligible === true/);
  assert.match(loop,/status IN \('scheduled','queued','publishing','retrying','credentials_required'\)/);
  assert.match(loop,/requested_by/);
  assert.match(loop,/'ai'/);
  assert.match(migration,/UPDATE marketing_publish_channels/);
  assert.match(migration,/json_extract/);
  assert.match(migration,/oauthConnectionId/);
  assert.match(migration,/credential_ref/);
});
