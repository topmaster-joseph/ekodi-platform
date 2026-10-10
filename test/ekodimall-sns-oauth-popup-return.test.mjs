import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {workspaceAdminScript} from '../workspace-admin-page.js';

const source=readFileSync(new URL('../workspace-admin-page.js',import.meta.url),'utf8');

test('OAuth callback identifies a real popup after cross-origin window.name reset',()=>{
  assert.match(source,/CHANNEL_OAUTH_POPUP_MARKER='ekodi-channel-oauth-popup-pending-v1'/);
  assert.match(source,/sessionStorage\.getItem\(CHANNEL_OAUTH_POPUP_MARKER\)==='pending'/);
  assert.match(source,/sessionStorage\.removeItem\(CHANNEL_OAUTH_POPUP_MARKER\)/);
  assert.match(source,/let returnedInPopup=window\.name===CHANNEL_OAUTH_POPUP_NAME/);
  assert.match(source,/if\(returnedInPopup\)/);
  assert.match(source,/popup\.sessionStorage\.setItem\(CHANNEL_OAUTH_POPUP_MARKER,'pending'\)/);
  assert.match(source,/if\(popup&&!popup\.closed\)/);
});

test('ordinary in-tab fallback does not need a popup marker to process an OAuth return',()=>{
  assert.match(source,/location\.assign\(d\.authorizationUrl\)/);
  assert.match(source,/if\(initialChannelOAuthResult\)/);
  assert.match(source,/publishChannelOAuthResult\(initialChannelOAuthResult\)/);
  assert.match(source,/channelOAuthNotice=initialChannelOAuthResult/);
  assert.match(source,/if\(returnedInPopup\)\{/);
});

test('connected channel takes priority over an older revoked record, and registry is not OAuth',()=>{
  const match=source.match(/const connectionFor=provider=>([^\n;]+);/);
  assert.ok(match,'connection preference expression');
  const connectionFor=new Function('connections','return provider=>'+match[1])([
    {provider:'youtube',status:'revoked',external_id:'old'},
    {provider:'youtube',status:'active',external_id:'new'},
    {provider:'facebook',status:'active',external_id:'page1'},
  ]);
  assert.equal(connectionFor('youtube').external_id,'new');
  assert.equal(connectionFor('facebook').external_id,'page1');
  assert.match(source,/const live=connection\?\.status==='active';/);
  assert.match(source,/계정 등록됨 · OAuth 확인 필요/);
  assert.match(source,/connection\?\.status==='active'\?\`<span class='tag live'>연결 유지/);
});

test('generated browser client is parseable and retains the OAuth event bus',async()=>{
  const body=await workspaceAdminScript().text();
  assert.doesNotThrow(()=>new Function(body));
  assert.match(body,/CHANNEL_OAUTH_POPUP_MARKER/);
  assert.match(body,/BroadcastChannel/);
  assert.match(body,/channelOAuthConfirmed/);
});
