import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read = path => readFile(new URL(`../${path}`, import.meta.url),'utf8');

test('Mall channel console unifies connection policy AI allocation and job recovery', async()=>{
  const ui=await read('workspace-admin-page.js');
  assert.match(ui,/채널설정/);
  assert.match(ui,/adminBase=standaloneMall\?'\/ekodimall\/admin':service==='mall'\?'\/ekodimall\/admin'/);
  assert.match(ui,/channelAccountForm/);
  assert.match(ui,/data-account-auth/);
  assert.match(ui,/registryConnectionId/);
  assert.match(ui,/channel-settings/);
  assert.match(ui,/channelPolicyForm/);
  assert.match(ui,/channelAiForm/);
  assert.match(ui,/data-channel-control/);
  assert.match(ui,/maxPostsPerDay/);
  assert.match(ui,/minHoursBetweenPosts/);
  assert.match(ui,/publishWindowStart/);
  assert.match(ui,/maxAttempts/);
  assert.match(ui,/data-job-action/);
  assert.match(ui,/MALL_CHANNEL_CSS/);
  assert.match(ui,/channel-quickbar/);
  assert.match(ui,/빠른 시작/);
  assert.match(ui,/channel-main-grid/);
  assert.match(ui,/channel-help/);
  assert.match(ui,/YouTube 최초 연결/);
  assert.match(ui,/관리자 로그인으로 사용/);
  assert.match(ui,/연결 유지/);
  assert.match(ui,/reconnect_required/);
  assert.doesNotMatch(ui,/account.status==='active'\?'재인증'/);
  assert.match(ui,/data-channel-quick/);
  assert.match(ui,/data-channel-panel/);
  assert.match(ui,/CHANNEL_OAUTH_RESULT_KEY/);
  assert.match(ui,/ekodi-channel-oauth-result/);
  assert.match(ui,/ekodi_channel_oauth_popup/);
  assert.match(ui,/applyChannelOAuthResult/);
  assert.match(ui,/채널 연결 완료/);
  assert.match(ui,/채널 설정/);

});

test('publishing engine enforces channel controls before provider execution', async()=>{
  const worker=await read('marketing-publishing-worker.js');
  assert.match(worker,/CHANNEL_DAILY_LIMIT/);
  assert.match(worker,/CHANNEL_COOLDOWN/);
  assert.match(worker,/CHANNEL_TIME_WINDOW/);
  assert.match(worker,/publication_deferred/);
  assert.match(worker,/channelControlMatch/);
  assert.match(worker,/request.method === 'GET'\) return readPolicy/);
  assert.match(worker,/credentialMode==='oauth-vault'/);
});

test('Mall OAuth projection preserves explicit control while applying safe defaults', async()=>{
  const growth=await read('marketing-growth-worker.js');
  assert.match(growth,/mallSubject=subject\.type==='tenant'&&subject\.key==='ekodimall'/);
  assert.match(growth,/ownedTenantAutopostSubject/);
  assert.match(growth,/autoProviders=ownedAutoSubject\?\['facebook','instagram','threads','youtube'\]:\['facebook','instagram','threads'\]/);
  assert.match(growth,/autoPublishEnabled:autoProviders\.includes\(provider\)/);
  assert.match(growth,/maxPostsPerDay:1/);
  assert.match(growth,/minHoursBetweenPosts:6/);
  assert.match(growth,/publishWindowStart:'08:00'/);
  assert.match(growth,/status='credentials_required'/);
  assert.doesNotMatch(growth,/UPDATE marketing_publish_channels SET status='disconnected'/);
});
