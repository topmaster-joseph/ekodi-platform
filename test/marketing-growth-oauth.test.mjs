import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read = path => readFile(new URL(`../${path}`, import.meta.url),'utf8');

test('EKODI central social connector exposes login-only YouTube OAuth and vault publishing', async () => {
  const [growth,publisher,ui,config] = await Promise.all([
    read('marketing-growth-worker.js'), read('marketing-publishing-worker.js'),
    read('marketing-ai-channel-manager.js'), read('wrangler.marketing-growth.toml'),
  ]);
  assert.match(growth,/startYouTubeOAuth/);
  assert.match(growth,/GOOGLE_BROKER_REDIRECT_URI = 'https:\/\/ekodi\.kr\/storage\/api\/control\/storage\/google\/callback'/);
  assert.match(growth,/GOOGLE_OAUTH_BROKER_REDIRECT_DRIFT/);
  assert.match(growth,/authorization\.searchParams\.get\('redirect_uri'\) !== GOOGLE_BROKER_REDIRECT_URI/);
  assert.match(growth,/authorization\.searchParams\.get\('client_id'\) !== String\(env\.GOOGLE_CLIENT_ID\)/);
  assert.match(growth,/consumeYouTubeTicket/);
  assert.match(growth,/oauth\/youtube\/callback/);
  assert.match(growth,/GOOGLE_OAUTH_BROKER/);
  assert.match(growth,/host === 'ekodi\.kr'/);
  assert.match(growth,/MARKETING_OAUTH_VAULT_KEY/);
  assert.match(growth,/refreshYouTubeAccessToken/);
  assert.match(growth,/youtubeTargetAccount/);
  assert.doesNotMatch(growth,/topmaster\.joseph@gmail\.com/);
  assert.match(growth,/registryConnectionId/);
  assert.match(growth,/oauthRegistryRow/);
  assert.match(growth,/adminIdentityFromSession/);
  assert.match(growth,/env\.CONTROL_API\.fetch/);
  assert.match(growth,/\/api\/session/);
  assert.match(growth,/platformAdmin:true/);
  assert.match(growth,/identity\.platformAdmin && identity\.adminRole === 'super_admin'/);
  assert.match(growth,/YOUTUBE_TARGET_ACCOUNT_MISMATCH/);
  assert.match(growth,/authorizedEmail,targetAccount/);
  assert.match(growth,/scopes:\['youtube\.upload','youtube\.readonly'\]/);
  assert.doesNotMatch(growth,/scopes:\['youtube\.upload','youtube\.readonly','youtube'\]/);
  const broker = await read('google-drive-storage-control.js');
  assert.doesNotMatch(broker,/auth\/youtube'[,\]]/);
  assert.match(growth,/token_ciphertext/);
  assert.match(growth,/upload\/youtube\/v3\/videos\?uploadType=resumable/);
  assert.match(publisher,/\['facebook','instagram','threads','youtube'\]/);
  assert.match(ui,/data-connect="youtube"/);
  assert.match(ui,/Google로 YouTube 연결/);
  assert.match(ui,/Metricool은 필수가 아닙니다/);
  assert.match(ui,/const API = '\/marketing-connect-api'/);
  assert.doesNotMatch(ui,/https:\/\/marketing-connect-api\.ekodi\.kr/);
  assert.match(broker,/MARKETING_YOUTUBE_CALLBACK = 'https:\/\/ekodi\.kr\/marketing-connect-api\/oauth\/youtube\/callback'/);
  assert.doesNotMatch(config,/`r`n/);
  assert.match(config,/MALL_PROMOTION_AUTOMATION_ENABLED = "true"\r?\nALLOWED_ORIGINS =/);
  assert.match(config,/GOOGLE_CLIENT_ID/);
  assert.match(config,/binding = "GOOGLE_OAUTH_BROKER"/);
  assert.match(config,/binding = "CONTROL_API"/);
  assert.match(config,/service = "ekodi-auth-api"/);
  assert.match(config,/service = "ekodi-storage-control"/);
  assert.match(config,/entrypoint = "GoogleOAuthBroker"/);
  assert.match(config,/PUBLIC_BASE_URL = "https:\/\/ekodi\.kr\/marketing-connect-api"/);
  assert.doesNotMatch(config,/marketing-connect-api\.ekodi\.kr/);
  assert.doesNotMatch(growth,/marketing-connect-api\.ekodi\.kr/);
});
