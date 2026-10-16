import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderMallSocialSetup} from '../mall-social-setup.js';
import {workspaceAdminScript,workspaceAdminCss} from '../workspace-admin-page.js';
import { youtubeDataApiDisabledProject, youtubeDataApiCloudUrl } from '../youtube-data-api-readiness.js';

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
  assert.match(html,/브랜드 채널/);
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

test('Google broker exchange failures are explained without demanding blind re-authorization', () => {
  const html=renderMallSocialSetup({oauthNotice:{status:'error',reason:'GOOGLE_OAUTH_EXCHANGE_FAILED'}});
  assert.match(html,/Google 인증 응답을 처리하지 못했습니다/);
  assert.match(html,/연결 상태를 먼저 확인/);
  assert.doesNotMatch(html,/>GOOGLE_OAUTH_EXCHANGE_FAILED</);
});


test('YouTube registered email is retained across OAuth status checks',()=>{
  const html=renderMallSocialSetup({
    platform:{youtubeConfigured:true}, connections:[],
    registeredAccounts:[{provider:'youtube',status:'pending_authorization',loginHint:'seller+test@example.com'}]
  });
  assert.match(html,/id="mallSocialYoutubeEmail"[^>]*value="seller\+test@example\.com"/);
  assert.doesNotMatch(html,/OAuth 인증 완료/);
});
test('failed YouTube connection reports the stored reason, never a raw provider error',()=>{
  const known=renderMallSocialSetup({platform:{youtubeConfigured:true},registeredAccounts:[{provider:'youtube',status:'error',lastError:'YOUTUBE_TARGET_ACCOUNT_MISMATCH'}]});
  assert.match(known,/최근 연결 실패/);
  assert.match(known,/브랜드 채널/);
  const unknown=renderMallSocialSetup({platform:{youtubeConfigured:true},registeredAccounts:[{provider:'youtube',status:'error',lastError:'secret-value:should-not-render'}]});
  assert.match(unknown,/인증 결과 확인/);
  assert.doesNotMatch(unknown,/secret-value/);
});
test('Google access denied callback is displayed as actionable failure without connection claims',()=>{
  const html=renderMallSocialSetup({oauthNotice:{status:'error',reason:'GOOGLE_OAUTH_ACCESS_DENIED'}});
  assert.match(html,/권한 동의가 완료되지 않았습니다/);
  assert.doesNotMatch(html,/계정 연결이 서버에서 확인됐습니다/);
});

test('YouTube Data API disabled is a Google project blocker not another OAuth permission request',()=>{
  const error='YouTube Data API v3 has not been used in project 483044030492 before or it is disabled';
  assert.deepEqual(youtubeDataApiDisabledProject(error),{code:'YOUTUBE_DATA_API_DISABLED',projectId:'483044030492'});
  assert.equal(youtubeDataApiCloudUrl(error),'https://console.cloud.google.com/apis/library/youtube.googleapis.com?project=483044030492');
  assert.equal(youtubeDataApiDisabledProject('invalid_grant'),null);
  const html=renderMallSocialSetup({platform:{youtubeConfigured:true},registeredAccounts:[{provider:'youtube',status:'error',lastError:error}]});
  assert.match(html,/이전 YouTube API 오류 기록/);
  assert.match(html,/project=483044030492/);
  assert.match(html,/저장된 오류만으로 현재 API 사용 설정 여부를 판정할 수 없습니다/);
  assert.doesNotMatch(html,/has not been used in project/);
  assert.match(html,/Google 공식 인증 시작/);
  assert.doesNotMatch(html,/YouTube Data API v3를 활성화한 뒤/);
});
test('no YouTube project setup warning if an actual active OAuth channel is connected',()=>{
  const html=renderMallSocialSetup({platform:{youtubeConfigured:true},registeredAccounts:[{provider:'youtube',status:'error',lastError:'YOUTUBE_DATA_API_DISABLED:483044030492'}],connections:[{provider:'youtube',status:'active',external_id:'UC-live'}]});
  assert.doesNotMatch(html,/Google Cloud API 사용 설정 필요/);
});

test('OAuth popup distinguishes failed Google callback from connected account',async()=>{
  assert.match(script,/const callbackOk=initialChannelOAuthResult\.status==='success'/);
  assert.match(script,/채널 인증 실패 · 연결되지 않음/);
  assert.match(script,/Google 인증 응답 접수 · 연결 확인 중/);
  assert.doesNotMatch(script,/<h1 style="font-size:20px">채널 인증 처리 완료<\/h1>/);
});

test('Brand Account choice survives manual OAuth ledger refresh and remains synchronized',()=>{
  assert.match(script,/const previousBrandSelection=service==='mall'/);
  assert.match(script,/brandModeInputs\.forEach\(box=>/);
  assert.match(script,/box\.checked=Boolean\(previousBrandSelection\)/);
  assert.match(script,/other\.checked=box\.checked/);
  assert.match(script,/youtubeBrandAccountMode:btn\.dataset\.provider==='youtube'&&Boolean\(brandModeInputs\.some\(box=>box\.checked\)\)/);
});
