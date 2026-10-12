import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {selectAuthorizedYouTubeChannels} from '../youtube-brand-channel-verification.js';

const source=async name=>readFile(new URL('../'+name,import.meta.url),'utf8');
const selected={items:[{id:'UC-brand-authorized',snippet:{title:'Brand Channel'}}]};
test('explicit Brand Account OAuth requires an authenticated single YouTube channel and registry identity',()=>{
  assert.equal(selectAuthorizedYouTubeChannels(selected,{brandAccountMode:true,registryConnectionId:'reg-1'})[0].id,'UC-brand-authorized');
  assert.throws(()=>selectAuthorizedYouTubeChannels({items:[]},{brandAccountMode:true,registryConnectionId:'reg-1'}),/YOUTUBE_CHANNEL_NOT_FOUND/);
  assert.throws(()=>selectAuthorizedYouTubeChannels(selected,{brandAccountMode:true}),/YOUTUBE_BRAND_CHANNEL_AMBIGUOUS/);
  assert.throws(()=>selectAuthorizedYouTubeChannels({items:[selected.items[0],{id:'UC-other'}]},{brandAccountMode:true,registryConnectionId:'reg-1'}),/YOUTUBE_BRAND_CHANNEL_AMBIGUOUS/);
  assert.equal(selectAuthorizedYouTubeChannels({items:[selected.items[0],{id:'UC-other'}]},{brandAccountMode:false}).length,2);
});
test('Brand Account opt-in is scoped and never disables signed OAuth, code exchange or email-based standard mode',async()=>{
  const [growth,broker,ui,setup]=await Promise.all(['marketing-growth-worker.js','google-drive-storage-control.js','workspace-admin-page.js','mall-social-setup.js'].map(source));
  assert.match(growth,/body\.youtubeBrandAccountMode===true/);
  assert.match(growth,/YOUTUBE_BRAND_ACCOUNT_SCOPE_FORBIDDEN/);
  assert.match(growth,/brandAccountMode\?'':accountHint/);
  assert.match(growth,/selectAuthorizedYouTubeChannels\(channels/);
  assert.match(growth,/YOUTUBE_TARGET_ACCOUNT_MISMATCH/);
  assert.match(broker,/signState\(env/);
  assert.match(broker,/readState\(env/);
  assert.match(broker,/authorizedEmail!==targetAccount/);
  assert.match(ui,/youtubeBrandAccountMode/);
  assert.match(setup,/브랜드 채널로 연결/);
  assert.match(growth,/channelSelection:brandAccountMode\?'brand_account':'google_email'/);
});
test('account linked banner uses registry ID or explicit connection IDs, never coincident email',async()=>{
 const ui=await source('workspace-admin-page.js');
 const statement=ui.slice(ui.indexOf('const oauthLinkedForAccount=account=>'),ui.indexOf('const accountRows=registeredAccounts.map'));
 assert.match(statement,/registryConnectionId/);
 assert.match(statement,/connectionIds/);
 assert.doesNotMatch(statement,/authorizedEmail/);
});
