import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderMallSocialSetup} from '../mall-social-setup.js';
import {workspaceAdminScript,workspaceAdminCss} from '../workspace-admin-page.js';

const script=readFileSync(new URL('../workspace-admin-page.js',import.meta.url),'utf8');
test('Mall setup is a compact three-step flow; account records do not prove OAuth',()=>{
  const html=renderMallSocialSetup({
    platform:{youtubeConfigured:true,metaConfigured:false,threadsConfigured:false},
    registeredAccounts:[{provider:'youtube',status:'active'}],
    connections:[],
    channels:[],jobs:[],
    policy:{mode:'autonomous'}
  });
  assert.match(html,/mallSocialYoutubeConnectForm/);
  assert.match(html,/mallSocialVerifyConnection/);
  assert.match(html,/실제 발행 가능 0개/);
  assert.match(html,/실행 대기/);
  assert.match(html,/3<\/b> 결과 확인/);
  assert.match(html,/youtube-pending/);
  assert.match(html,/Google 공식 인증 시작/);
  assert.doesNotMatch(html,/name="password"/);
});

test('real active OAuth is not asked to reconnect',()=>{
  const html=renderMallSocialSetup({
    platform:{youtubeConfigured:true},
    registeredAccounts:[{provider:'youtube',status:'active'}],
    connections:[{provider:'youtube',status:'active',external_id:'UC123'}],
    channels:[{provider:'youtube',external_account_id:'UC123',status:'active',config:{autoPublishEnabled:true}}]
  });
  assert.doesNotMatch(html,/id="mallSocialYoutubeConnectForm"/);
  assert.match(html,/실제 발행 가능 1개/);
});

test('expired and mismatched callback errors show safe recovery without another automatic login',()=>{
  const html=renderMallSocialSetup({oauthNotice:{status:'error',reason:'YOUTUBE_TARGET_ACCOUNT_MISMATCH'}});
  assert.match(html,/같은 계정/);
  assert.doesNotMatch(html,/refresh_token/i);
  assert.doesNotMatch(html,/<script>/);
});

test('admin code keeps manual refresh separate from OAuth and distinguishes registered from connected',async()=>{
  assert.match(script,/const oauthLinkedForAccount=account=>connections\.some/);
  assert.match(script,/account\.metadata\?\.oauth\?\.connectionIds/);
  assert.match(script,/if\(alreadyActive&&oauthLinkedForAccount\(alreadyActive\)\)/);
  assert.match(script,/youtubeConnected=connections\.some/);
  assert.match(script,/id='mall-sns-advanced'/);
  assert.match(script,/mallSocialVerifyConnection/);
  assert.match(script,/mall-simple-grid/);
  assert.match(script,/id='channel-policy'/);
  const js=await workspaceAdminScript().text();
  assert.doesNotThrow(()=>new Function(js));
  const css=await workspaceAdminCss().text();
  assert.match(css,/mall-simple-grid/);
  assert.match(css,/youtube-pending/);
});

test('provider cards use a single class attribute so the pending YouTube connect action is hidden',()=>{
  const html=renderMallSocialSetup({platform:{youtubeConfigured:true}});
  const card=html.match(/<article[^>]*data-mall-provider="youtube"[^>]*>/)?.[0] || '';
  assert.match(card,/class="mall-social-provider youtube-pending"/);
  assert.equal((card.match(/\bclass=/g)||[]).length,1);
});

test('a provider cannot claim active publishing with another OAuth account channel',()=>{
  const html=renderMallSocialSetup({
    platform:{metaConfigured:true},
    connections:[{provider:'facebook',status:'active',external_id:'page-A'}],
    channels:[{provider:'facebook',status:'active',external_account_id:'page-B',config:{autoPublishEnabled:true}}],
  });
  assert.match(html,/실제 발행 가능 0개/);
  const block=html.match(/<article[^>]*data-mall-provider="facebook"[\s\S]*?<\/article>/)?.[0] || '';
  assert.match(block,/실제 발행 중지/);
  assert.doesNotMatch(block,/실제 발행 사용 중/);
});
